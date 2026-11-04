import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMeasure, handleMeasureStream, handleSiteStream, type Guard } from "@/lib/api";
import { addCredits, limitReached } from "@/lib/limits";
import type { ScrapeClient } from "@/lib/measure";
import { sharedResult } from "@/lib/results";
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
  handleMeasureStream(new Request(`http://localhost/api/measure/stream${query}`), client, { store, ip: "1.2.3.4", ...guard });

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
    const run = () => handleSiteStream(new Request("http://localhost/api/site/stream?domain=www.example.com"), client, { store }).then(events);
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
    expect((await refused.json()).code).toBe("DEMO_LIMIT");
  });
});

describe("kill switch (LIVE_CHECKS=off)", () => {
  it("serves the cache but makes no live call", async () => {
    const store = memoryStore();
    await pageStream(store).then(events);
    const { client, calls } = exampleClient();
    expect((await pageStream(store, undefined, client, { liveOff: true })).status).toBe(200);
    const res = await handleMeasure(new Request("http://localhost/api/measure?url=example.com/new"), client, { store, liveOff: true });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});
