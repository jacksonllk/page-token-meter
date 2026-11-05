import { describe, expect, it } from "vitest";
import { measure, type ScrapeClient } from "@/lib/measure";
import { isPrivateAddress, plainFetch, type TextFetch, type TextResult } from "@/lib/plain-fetch";
import { measureSite, type SiteClient } from "@/lib/site";
import { callKind, EXAMPLE_FULL, EXAMPLE_MAIN, fakeResponse } from "./helpers/fake-client";

type Params = Parameters<ScrapeClient["web"]["scrape"]>[0];

// A page at https://example.com/ that declares these Markdown links in its HTML.
function pageClient(alternates: string[]) {
  const calls: Params[] = [];
  const full = { ...fakeResponse(EXAMPLE_FULL), metadata: { alternates: alternates.map((href) => ({ href, type: "text/markdown" })) } };
  const client = {
    web: {
      scrape: async (params: Params) => {
        calls.push(params);
        const kind = callKind(params);
        return kind === "full" ? full : fakeResponse(EXAMPLE_MAIN);
      },
    },
  } as unknown as ScrapeClient;
  return { client, kinds: () => calls.map(callKind) };
}

const answer = (result: TextResult): TextFetch => async () => result;

describe("published check without a context.dev call", () => {
  it("downloads the page's own Markdown file", async () => {
    const { client, kinds } = pageClient(["https://example.com/index.md"]);
    const m = await measure("https://example.com/", client, { fetchText: answer({ status: "ok", text: EXAMPLE_MAIN }) });
    expect(kinds().sort()).toEqual(["full", "main"]);
    expect(m.published).toMatchObject({ status: "offered", chars: EXAMPLE_MAIN.length, url: "https://example.com/index.md" });
  });

  it("says no Markdown version when the page declares none, without any request", async () => {
    const { client, kinds } = pageClient([]);
    let asked = false;
    const m = await measure("https://example.com/", client, { fetchText: async () => ((asked = true), { status: "ok", text: "" }) });
    expect(asked).toBe(false);
    expect(kinds()).not.toContain("published");
    expect(m.published.status).toBe("not_offered");
  });

  it("cannot confirm when the page declares only a site-wide Markdown file", async () => {
    const { client, kinds } = pageClient(["https://example.com/auth.md"]);
    const m = await measure("https://example.com/", client, { fetchText: answer({ status: "ok", text: "x" }) });
    expect(kinds()).not.toContain("published");
    expect(m.published.status).toBe("unconfirmed");
  });

  it("says no Markdown version when the declared file does not exist", async () => {
    const { client, kinds } = pageClient(["https://example.com/index.md"]);
    const m = await measure("https://example.com/", client, { fetchText: answer({ status: "missing" }) });
    expect(kinds()).not.toContain("published");
    expect(m.published.status).toBe("not_offered");
  });

  it("asks context.dev when the download is blocked", async () => {
    const { client, kinds } = pageClient(["https://example.com/index.md"]);
    await measure("https://example.com/", client, { fetchText: answer({ status: "blocked" }) });
    expect(kinds().sort()).toEqual(["full", "main", "published"]);
  });
});

describe("llms.txt without a context.dev call", () => {
  const LLMS = "# Example\n\n## Docs\n\n- [Pricing](https://example.com/pricing)\n- [Docs](https://example.com/docs)\n";

  function siteClient() {
    const scraped: string[] = [];
    const client = {
      web: {
        mapUrls: async () => ({ domain: "example.com", request_id: "t", success: true, urls: [{ url: "https://example.com/" }] }),
        scrape: async ({ url }: Params) => (scraped.push(url), fakeResponse("word ".repeat(20), "")),
      },
    } as unknown as SiteClient;
    return { client, scraped };
  }

  it("downloads llms.txt directly and measures the pages it lists", async () => {
    const { client, scraped } = siteClient();
    const site = await measureSite("example.com", client, { fetchText: answer({ status: "ok", text: LLMS }) });
    expect(site.source).toBe("llms.txt");
    // Ranked: the home page (found by Map, not listed), then docs, then pricing.
    expect(scraped).toEqual(["https://example.com/", "https://example.com/docs", "https://example.com/pricing"]);
  });

  it("picks pages itself when there is no llms.txt, without asking context.dev", async () => {
    const { client, scraped } = siteClient();
    const site = await measureSite("example.com", client, { fetchText: answer({ status: "missing" }) });
    expect(site.source).toBe("pick");
    expect(scraped.some((u) => u.endsWith("llms.txt"))).toBe(false);
  });

  it("asks context.dev when the download is blocked", async () => {
    const { client, scraped } = siteClient();
    await measureSite("example.com", client, { fetchText: answer({ status: "blocked" }) });
    expect(scraped).toContain("https://example.com/llms.txt");
  });
});

describe("plainFetch safety", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "treats %s as private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(["8.8.8.8", "104.18.2.3", "2606:4700::1111"])("treats %s as public", (ip) => expect(isPrivateAddress(ip)).toBe(false));

  it("refuses local addresses", async () => {
    expect(await plainFetch("http://127.0.0.1:3000/llms.txt")).toEqual({ status: "blocked" });
    expect(await plainFetch("http://localhost/llms.txt")).toEqual({ status: "blocked" });
  });
});
