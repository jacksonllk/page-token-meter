import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMeasure, handleMeasureStream, handleSiteStream, type Guard } from "@/lib/api";
import { websiteFrom } from "@/lib/keypages";
import { addCredits, limitReached } from "@/lib/limits";
import type { Measurement, ScrapeClient } from "@/lib/measure";
import { cached, chipSaved, latestSite, saveResult, sharedResult } from "@/lib/results";
import type { SiteClient } from "@/lib/site";
import { memoryStore, type Store } from "@/lib/store";
import { exampleClient, fakeResponse } from "./helpers/fake-client";

const HOUR = 60 * 60 * 1000;

async function events(res: Response) {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const pageStream = (store: Store, query = "?url=docs.context.dev", client = exampleClient().client, guard: Partial<Guard> = {}) =>
  handleMeasureStream(new Request(`http://localhost/api/page/stream${query}`), client, { store, ip: "1.2.3.4", ...guard });

describe("memoryStore", () => {
  it("forgets a value after its ttl", async () => {
    let now = 0;
    const store = memoryStore(() => now);
    await store.set("a", { n: 1 }, 10);
    await store.set("b", { n: 2 });
    expect(await store.get("a")).toEqual({ n: 1 });
    now = 10_000;
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toEqual({ n: 2 });
  });

  it("keeps the first ttl when a counter goes up", async () => {
    let now = 0;
    const store = memoryStore(() => now);
    expect(await store.incr("c", 2, 10)).toBe(2);
    now = 5_000;
    expect(await store.incr("c", 3, 10)).toBe(5);
    now = 10_000;
    expect(await store.incr("c", 1, 10)).toBe(1);
  });
});

describe("daily credit limits", () => {
  afterEach(() => vi.unstubAllEnvs());
  const day = Date.UTC(2026, 10, 6, 12);

  it("stops a visitor at their own limit, but not other visitors", async () => {
    vi.stubEnv("VISITOR_DAILY_CREDITS", "30");
    const store = memoryStore();
    await addCredits(store, "1.2.3.4", 29, day);
    expect(await limitReached(store, "1.2.3.4", day)).toBeNull();
    await addCredits(store, "1.2.3.4", 1, day);
    expect(await limitReached(store, "1.2.3.4", day)).toBe("visitor");
    expect(await limitReached(store, "5.6.7.8", day)).toBeNull();
    expect(await limitReached(store, "1.2.3.4", day + 24 * HOUR)).toBeNull();
  });

  it("stops everyone at the whole-site cap", async () => {
    vi.stubEnv("DAILY_CREDIT_CAP", "50");
    vi.stubEnv("VISITOR_DAILY_CREDITS", "30");
    const store = memoryStore();
    await addCredits(store, "1.2.3.4", 25, day);
    await addCredits(store, "5.6.7.8", 25, day);
    expect(await limitReached(store, "9.9.9.9", day)).toBe("site");
  });

  it("has no limits when neither setting is set", async () => {
    const store = memoryStore();
    await addCredits(store, "1.2.3.4", 1000, day);
    expect(await limitReached(store, "1.2.3.4", day)).toBeNull();
  });

  it("never stores the IP address itself", async () => {
    const keys: string[] = [];
    const store = memoryStore();
    const spy: Store = { ...store, incr: (key, by, ttl) => (keys.push(key), store.incr(key, by, ttl)) };
    await addCredits(spy, "1.2.3.4", 1, day);
    expect(keys.join(" ")).not.toContain("1.2.3.4");
  });
});

describe("cache and share copy", () => {
  it("serves a repeat check from the cache with no calls and no steps", async () => {
    const store = memoryStore();
    const { client, calls } = exampleClient();
    const first = await events(await pageStream(store, undefined, client));
    expect(calls).toHaveLength(3);

    const second = await events(await pageStream(store, undefined, client));
    expect(calls).toHaveLength(3);
    expect(second).toHaveLength(1);
    expect(second[0].result).toEqual(first.at(-1).result);
  });

  it("measures again with ?fresh=1", async () => {
    const store = memoryStore();
    const { client, calls } = exampleClient();
    await pageStream(store, undefined, client).then(events);
    await pageStream(store, "?url=docs.context.dev&fresh=1", client).then(events);
    expect(calls).toHaveLength(6);
  });

  it("saves a share copy without the page text", async () => {
    const store = memoryStore();
    const result = (await events(await pageStream(store))).at(-1).result;
    expect(result.preview.length).toBeGreaterThan(0);
    const shared = await sharedResult(store, result.id);
    expect(shared?.kind).toBe("page");
    expect(shared?.kind === "page" && shared.result.markdown.tokens).toBe(result.markdown.tokens);
    expect(shared?.kind === "page" && shared.result.preview).toEqual([]);
    expect(shared?.kind === "page" && shared.result.readingOrder).toBeNull();
    // The token map holds no page text, so the share copy keeps it for the share page and its preview image.
    expect(result.heat?.length).toBeGreaterThan(0);
    expect(shared?.kind === "page" && shared.result.heat).toEqual(result.heat);
  });

  it("caches a site result by domain", async () => {
    const store = memoryStore();
    let scrapes = 0;
    const client = {
      web: {
        mapUrls: async () => ({ domain: "example.com", request_id: "t", success: true, urls: [{ url: "https://example.com/" }] }),
        scrape: async () => (scrapes++, fakeResponse("word ".repeat(20), "")),
      },
    } as unknown as SiteClient;
    const run = () => handleSiteStream(new Request("http://localhost/api/website/stream?domain=www.example.com"), client, { store }).then(events);
    await run();
    const used = scrapes;
    const again = await run();
    expect(scrapes).toBe(used);
    expect(again.map((e) => e.type)).toEqual(["done"]);
    expect((await sharedResult(store, again[0].result.id))?.kind).toBe("site");
  });

  it("ignores share ids that are not ours", async () => {
    expect(await sharedResult(memoryStore(), "../cache:page:x")).toBeNull();
  });
});

describe("hosted demo (limits set)", () => {
  beforeEach(() => {
    vi.stubEnv("DAILY_CREDIT_CAP", "100");
    vi.stubEnv("VISITOR_DAILY_CREDITS", "30");
  });
  afterEach(() => vi.unstubAllEnvs());
  const paid = { ...fakeResponse("word ".repeat(20)), key_metadata: { credits_consumed: 1 } } as ReturnType<typeof fakeResponse>;
  const paidClient = { web: { scrape: async () => paid } } as unknown as ScrapeClient;

  it("adds each check's credits to the visitor's and the site's totals", async () => {
    const store = memoryStore();
    await pageStream(store, undefined, paidClient).then(events);
    await pageStream(store, "?url=example.com/2", paidClient).then(events);
    vi.stubEnv("VISITOR_DAILY_CREDITS", "6");
    expect(await limitReached(store, "1.2.3.4")).toBe("visitor");
    vi.stubEnv("VISITOR_DAILY_CREDITS", "");
    vi.stubEnv("DAILY_CREDIT_CAP", "6");
    expect(await limitReached(store, "5.6.7.8")).toBe("site");
  });

  it("counts what a failed check was charged, including calls that finish after the failure", async () => {
    const store = memoryStore();
    // The full page fails at once. The main-content call is charged and finishes later.
    const failed = { ...fakeResponse(null), key_metadata: { credits_consumed: 1 } } as ReturnType<typeof fakeResponse>;
    const client = {
      web: { scrape: async (p: { sharedParams?: { mainContentOnly?: boolean } }) => (p.sharedParams?.mainContentOnly ? (await new Promise((r) => setTimeout(r, 30)), paid) : failed) },
    } as unknown as ScrapeClient;
    const list = await pageStream(store, undefined, client).then(events);
    expect(list.at(-1).type).toBe("error");
    vi.stubEnv("VISITOR_DAILY_CREDITS", "3");
    expect(await limitReached(store, "1.2.3.4")).toBeNull();
    vi.stubEnv("VISITOR_DAILY_CREDITS", "2");
    expect(await limitReached(store, "1.2.3.4")).toBe("visitor");
  });

  it("counts nothing for a call context.dev refused", async () => {
    const store = memoryStore();
    const client = { web: { scrape: async () => Promise.reject(new Error("402")) } } as unknown as ScrapeClient;
    await pageStream(store, undefined, client).then(events);
    vi.stubEnv("VISITOR_DAILY_CREDITS", "1");
    expect(await limitReached(store, "1.2.3.4")).toBeNull();
  });

  it("refuses a visitor over their limit, but still serves the cache", async () => {
    const store = memoryStore();
    await pageStream(store).then(events);
    await addCredits(store, "1.2.3.4", 30);
    const refused = await pageStream(store, "?url=example.com/new");
    expect(refused.status).toBe(429);
    expect((await refused.json()).code).toBe("VISITOR_LIMIT");
    expect((await pageStream(store)).status).toBe(200);
  });

  it("refuses everyone once the whole-site cap is reached", async () => {
    const store = memoryStore();
    await addCredits(store, "5.6.7.8", 100);
    const refused = await pageStream(store, "?url=example.com/new");
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: "DAILY_CAP", error: expect.stringMatching(/^Today's free checks are used up\./) });
  });
});

describe("kill switch (LIVE_CHECKS=off)", () => {
  it("serves the cache but makes no live call", async () => {
    const store = memoryStore();
    await pageStream(store).then(events);
    const { client, calls } = exampleClient();
    expect((await pageStream(store, undefined, client, { liveOff: true })).status).toBe(200);
    const res = await handleMeasure(new Request("http://localhost/api/page?url=example.com/new"), client, { store, liveOff: true });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe("try chips", () => {
  // A small stripe.com whose page size can change between runs.
  function chipSite(words: { n: number }) {
    let scrapes = 0;
    const client = {
      web: {
        mapUrls: async () => ({ domain: "stripe.com", request_id: "t", success: true, urls: [{ url: "https://stripe.com/" }] }),
        scrape: async () => (scrapes++, fakeResponse("word ".repeat(words.n), "")),
      },
    } as unknown as SiteClient;
    return { client, scrapes: () => scrapes };
  }
  const run = (store: Store, client: SiteClient, fresh = false) =>
    handleSiteStream(new Request(`http://localhost/api/website/stream?domain=stripe.com${fresh ? "&fresh=1" : ""}`), client, { store }).then(events);

  it("serves a chip's saved result for a week, then the next click runs a live check", async () => {
    let now = Date.UTC(2026, 10, 6);
    const store = memoryStore(() => now);
    const { client, scrapes } = chipSite({ n: 100 });
    const first = (await run(store, client)).at(-1).result;
    const used = scrapes();
    now += 6 * 24 * HOUR;
    const later = await run(store, client);
    expect(scrapes()).toBe(used);
    expect(later.map((e) => e.type)).toEqual(["done"]);
    expect(later[0].result.id).toBe(first.id);
    now += 2 * 24 * HOUR;
    const refreshed = (await run(store, client)).at(-1).result;
    expect(scrapes()).toBeGreaterThan(used);
    expect(refreshed.id).not.toBe(first.id);
  });

  it("ignores Measure again on a chip within its week", async () => {
    const store = memoryStore();
    const { client, scrapes } = chipSite({ n: 100 });
    const first = (await run(store, client)).at(-1).result;
    const used = scrapes();
    const again = await run(store, client, true);
    expect(scrapes()).toBe(used);
    expect(again[0].result.id).toBe(first.id);
  });

  it("does not serve a chip result older than a week, even if the store kept it", async () => {
    const store = memoryStore();
    const old = { id: "old", domain: "stripe.com", measuredAt: new Date(Date.now() - 8 * 24 * HOUR).toISOString() };
    await store.set("chip:site:stripe.com", old);
    expect(await chipSaved(store, "site", "stripe.com")).toBeNull();
  });

  it("saves a chip website's page for a week with its page text", async () => {
    let now = Date.UTC(2026, 10, 6);
    const store = memoryStore(() => now);
    const url = "https://stripe.com/pricing";
    const result = { id: "p1", url, measuredAt: new Date().toISOString(), preview: [{ main: true, text: "Pricing" }], readingOrder: [] } as unknown as Measurement;
    await saveResult(store, "page", url, result);
    now += 3 * 24 * HOUR;
    expect(await cached(store, "page", url)).toBeNull();
    expect(await chipSaved(store, "page", url)).toMatchObject({ id: "p1", preview: [{ text: "Pricing" }] });
    now += 5 * 24 * HOUR;
    expect(await chipSaved(store, "page", url)).toBeNull();
  });

  it("keeps other websites' pages for 24 hours only", async () => {
    let now = Date.UTC(2026, 10, 6);
    const store = memoryStore(() => now);
    const url = "https://example.com/pricing";
    await saveResult(store, "page", url, { id: "p2", url, measuredAt: new Date().toISOString(), preview: [], readingOrder: null } as unknown as Measurement);
    expect(await chipSaved(store, "page", url)).toBeNull();
    now += 25 * HOUR;
    expect(await cached(store, "page", url)).toBeNull();
  });
});

describe("website in the address", () => {
  it.each([
    ["stripe.com", "stripe.com"],
    ["Stripe.com", "stripe.com"],
    ["www.stripe.com", "stripe.com"],
    ["docs.stripe.com", "stripe.com"],
    ["example.co.uk", "example.co.uk"],
    ["https%3A%2F%2Fvercel.com", "vercel.com"],
  ])("reads %s as %s", (param, website) => {
    expect(websiteFrom(param)).toBe(website);
  });

  it.each(["localhost", "favicon", "127.0.0.1", "%E0%A4%A", "printer.local"])("rejects %s", (param) => {
    expect(websiteFrom(param)).toBeNull();
  });
});

describe("latest result for a website", () => {
  it("keeps the last result after the 24-hour cache expires", async () => {
    let now = Date.UTC(2026, 10, 6);
    const store = memoryStore(() => now);
    const client = {
      web: {
        mapUrls: async () => ({ domain: "example.com", request_id: "t", success: true, urls: [{ url: "https://example.com/" }] }),
        scrape: async () => fakeResponse("word ".repeat(30), ""),
      },
    } as unknown as SiteClient;
    const result = (await handleSiteStream(new Request("http://localhost/api/website/stream?domain=example.com"), client, { store }).then(events)).at(-1).result;
    now += 3 * 24 * HOUR;
    expect(await cached(store, "site", "example.com")).toBeNull();
    expect((await latestSite(store, "example.com"))?.id).toBe(result.id);
    expect(await latestSite(store, "never-measured.com")).toBeNull();
  });
});
