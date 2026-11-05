import { afterEach, describe, expect, it, vi } from "vitest";
import { llmsTxtCandidates, maxKeyPages, normalizeDomain, parseLlmsTxt, pickKeyPages, pool, siteDomain } from "@/lib/keypages";
import { handleSite } from "@/lib/api";
import type { SiteEvent } from "@/lib/events";
import { measureSite, type SiteClient } from "@/lib/site";
import { fakeResponse } from "./helpers/fake-client";

// A made-up site map. No real site, no credits.
const URLS = [
  "https://example.com/",
  "https://example.com/pricing",
  "https://docs.example.com/",
  "https://docs.example.com/guides/install",
  "https://example.com/blog",
  "https://example.com/blog/post-1",
  "https://example.com/changelog",
  "https://example.com/about",
  "https://example.com/customers",
  "https://example.com/features",
  "https://docs.example.com/quickstart",
  "https://docs.example.com/api-reference/users/create",
  "https://docs.example.com/api-reference",
  "https://example.com/integrations",
  "https://example.com/security",
  "not a url",
];

// A small llms.txt in the llmstxt.org format.
const LLMS_TXT = [
  "# Example",
  "> Example is an API for widgets.",
  "## Docs",
  "- [Quickstart](https://docs.example.com/quickstart): set up in 5 minutes",
  "- [API reference](https://docs.example.com/api-reference)",
  "- [OpenAPI spec](https://example.com/openapi.json)",
  "- [Sitemap](https://example.com/sitemap.xml)",
  "- [Partner page](https://other.com/example)",
  "- [Quickstart again](https://docs.example.com/quickstart)",
  "## Optional",
  "- [Blog](https://example.com/blog)",
].join("\n");

// Fake client: Map returns `urls`; each scrape returns a short Markdown page.
function siteClient(urls: string[], markdownFor: (url: string) => string | Error = (url) => `# ${url}\n` + "word ".repeat(100)) {
  const scraped: string[] = [];
  let mapCalls = 0;
  const client = {
    web: {
      mapUrls: async () => {
        mapCalls++;
        return { domain: "example.com", request_id: "test", success: true, urls: urls.map((url) => ({ url })) };
      },
      scrape: async (params: { url: string }) => {
        scraped.push(params.url);
        const md = markdownFor(params.url);
        if (md instanceof Error) throw md;
        return fakeResponse(md, "<html></html>");
      },
    },
  } as unknown as SiteClient;
  return { client, scraped, mapCalls: () => mapCalls };
}

describe("pickKeyPages", () => {
  it("picks up to 8 pages in the ranked order: home, product, docs, pricing, API reference...", () => {
    const picks = pickKeyPages("example.com", URLS);
    expect(picks.map((p) => p.role)).toEqual(["Home", "Product", "Docs", "Pricing", "API reference", "Integrations", "About", "Changelog"]);
    expect(picks.find((p) => p.role === "Docs")?.url).toBe("https://docs.example.com/");
  });

  it("takes the shallowest address for a role", () => {
    expect(pickKeyPages("example.com", URLS).find((p) => p.role === "API reference")?.url).toBe("https://docs.example.com/api-reference");
  });

  it("fills a services website with its service pages, About and Contact", () => {
    const urls = ["https://law.com/", "https://law.com/services/divorce", "https://law.com/services/wills", "https://law.com/about", "https://law.com/contact", "https://law.com/faq"];
    expect(pickKeyPages("law.com", urls).map((p) => p.role)).toEqual(["Home", "Product", "Product", "About", "FAQ", "Contact"]);
  });

  it("never picks sign-up, log-in, careers, blog, legal, status or sitemap pages", () => {
    const urls = [...URLS, "https://example.com/signup", "https://example.com/login", "https://example.com/careers", "https://example.com/terms", "https://status.example.com/", "https://example.com/sitemap.md", "https://example.com/.well-known/oauth"];
    expect(pickKeyPages("example.com", urls, 20).map((p) => p.url).filter((u) => /signup|login|careers|blog|terms|status|sitemap|well-known/.test(u))).toEqual([]);
  });

  it("adds the home page when Map does not list it", () => {
    const picks = pickKeyPages("example.com", ["https://example.com/pricing"]);
    expect(picks[0]).toEqual({ role: "Home", url: "https://example.com/" });
  });

  it("never picks the same URL twice", () => {
    const picks = pickKeyPages("example.com", URLS);
    expect(new Set(picks.map((p) => p.url)).size).toBe(picks.length);
  });
});

describe("parseLlmsTxt", () => {
  it("returns the pages and files it lists on this site, once each, before the Optional section", () => {
    expect(parseLlmsTxt(LLMS_TXT, "example.com")).toEqual({
      pages: ["https://docs.example.com/quickstart", "https://docs.example.com/api-reference", "https://docs.example.com/quickstart"],
      files: [{ role: "OpenAPI spec", url: "https://example.com/openapi.json", file: true }],
    });
  });

  it("counts Markdown copies as pages, keeps at most 2 files and skips sitemaps", () => {
    const text = ["# Docs", "- [A](https://example.com/a.md)", "- [Spec](https://example.com/a.json)", "- [Spec 2](https://example.com/b.yaml)", "- [Notes](https://example.com/notes.txt)", "- [Map](https://example.com/sitemap.xml)"].join("\n");
    const parsed = parseLlmsTxt(text, "example.com");
    expect(parsed?.pages).toEqual(["https://example.com/a.md"]);
    expect(parsed?.files).toHaveLength(2);
  });

  it("skips other llms.txt files listed in it: indexes and whole-site dumps", () => {
    const text = ["# Docs", "- [Home](https://example.com/)", "- [Full docs](https://example.com/docs/llms-full.txt)", "- [Docs index](https://docs.example.com/llms.txt)", "- [Spec](https://example.com/openapi.json)"].join("\n");
    expect(parseLlmsTxt(text, "example.com")?.files.map((f) => f.url)).toEqual(["https://example.com/openapi.json"]);
  });

  it("returns null for text that is not an llms.txt, such as a not-found page", () => {
    expect(parseLlmsTxt("Page not found\n- [Home](https://example.com/)", "example.com")).toBeNull();
    expect(parseLlmsTxt("# Empty\n> No links here.", "example.com")).toBeNull();
  });
});

describe("maxKeyPages", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is 8 unless MAX_KEY_PAGES is set to a whole number above 0", () => {
    expect(maxKeyPages()).toBe(8);
    vi.stubEnv("MAX_KEY_PAGES", "20");
    expect(maxKeyPages()).toBe(20);
    for (const bad of ["0", "-3", "2.5", "lots"]) {
      vi.stubEnv("MAX_KEY_PAGES", bad);
      expect(maxKeyPages()).toBe(8);
    }
  });
});

describe("llmsTxtCandidates", () => {
  it("looks on the main site, then on the docs subdomain when there is one", () => {
    expect(llmsTxtCandidates("example.com", URLS)).toEqual(["https://example.com/llms.txt", "https://docs.example.com/llms.txt"]);
    expect(llmsTxtCandidates("example.com", ["https://www.example.com/"])).toEqual(["https://www.example.com/llms.txt"]);
  });
});

describe("normalizeDomain", () => {
  it.each([
    ["context.dev", "context.dev"],
    ["https://www.Context.dev/pricing", "context.dev"],
    ["docs.context.dev", "docs.context.dev"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([null, "", "localhost", "ftp://x.com"])("rejects %s", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe("siteDomain", () => {
  it.each([
    ["docs.context.dev", "context.dev"],
    ["context.dev", "context.dev"],
    ["www.example.com", "example.com"],
    ["shop.example.co.uk", "example.co.uk"],
  ])("%s -> %s", (input, expected) => {
    expect(siteDomain(input)).toBe(expected);
  });
});

describe("pool", () => {
  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await pool([1, 2, 3, 4, 5], 2, async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(2);
  });
});

describe("measureSite", () => {
  it("measures each key page and reports the total and the heaviest", async () => {
    const { client, scraped } = siteClient(URLS, (url) => (url.endsWith("/pricing") ? "word ".repeat(5000) : "word ".repeat(10)));
    const site = await measureSite("example.com", client);
    // 2 places checked for an llms.txt (none found), then 8 pages.
    expect(scraped).toHaveLength(10);
    expect(site.source).toBe("pick");
    expect(site.pages).toHaveLength(8);
    expect(site.totalMarkdownTokens).toBe(site.pages.reduce((sum, p) => sum + (p.markdown?.tokens ?? 0), 0));
    expect(site.heaviest?.role).toBe("Pricing");
  });

  it("ignores addresses on other subdomains, such as a merch shop's /products", () => {
    const picks = pickKeyPages("example.com", ["https://example.com/", "https://merch.example.com/products/t-shirt", "https://example.com/products/widgets"]);
    expect(picks.filter((p) => p.role === "Product").map((p) => p.url)).toEqual(["https://example.com/products/widgets"]);
  });

  it("picks by address only: a link named Pricing deep in the docs is not the pricing page", () => {
    const listed = ["https://example.com/docs/endpoints/pricing.md", "https://example.com/slack-app.md"];
    const picks = pickKeyPages("example.com", ["https://example.com/", "https://example.com/pricing"], 8, listed);
    expect(picks.filter((p) => p.role === "Pricing").map((p) => p.url)).toEqual(["https://example.com/pricing"]);
    // The Slack app is a product only in the llms.txt's words: not picked.
    expect(picks.some((p) => p.url.includes("slack-app"))).toBe(false);
  });

  it("uses pages the llms.txt lists when Map missed them, and prefers them in a tie", () => {
    const picks = pickKeyPages("example.com", ["https://example.com/", "https://example.com/docs/introduction"], 8, ["https://example.com/pricing", "https://example.com/docs/quickstart"]);
    expect(picks.find((p) => p.role === "Pricing")?.url).toBe("https://example.com/pricing");
    expect(picks.find((p) => p.role === "Docs")?.url).toBe("https://example.com/docs/quickstart");
  });

  it("treats a page and its Markdown copy as one page", () => {
    const picks = pickKeyPages("example.com", ["https://www.example.com/pricing"], 8, ["https://example.com/pricing.md"]);
    expect(picks.filter((p) => p.role === "Pricing").map((p) => p.url)).toEqual(["https://www.example.com/pricing"]);
  });

  it("measures more pages when MAX_KEY_PAGES is raised, and records the limit", async () => {
    vi.stubEnv("MAX_KEY_PAGES", "12");
    try {
      const { client } = siteClient(URLS);
      const site = await measureSite("example.com", client);
      // URLS has 11 key pages: more than the default 8, fewer than 12.
      expect(site.pages).toHaveLength(11);
      expect(site.maxPages).toBe(12);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records when each step and each page finished, so a saved result can show the times", async () => {
    const { client } = siteClient(URLS);
    const events: SiteEvent[] = [];
    const site = await measureSite("example.com", client, { onEvent: (e) => events.push(e) });
    const at = (type: string) => events.find((e) => e.type === type)?.ms;
    expect(site.steps).toEqual({ map: { ms: at("map"), urlCount: URLS.length }, llms: at("llms"), picked: at("picked"), total: expect.any(Number) });
    for (const p of site.pages) expect(p.ms).toBeLessThanOrEqual(site.steps!.total);
    expect(site.pages.map((p) => p.ms)).toEqual(site.pages.map((_, i) => events.find((e) => e.type === "page" && e.index === i)?.ms));
  });

  it("records which pages context.dev answered from a copy it had already made", async () => {
    const { client } = siteClient(URLS);
    const scrape = client.web.scrape;
    client.web.scrape = (async (params: { url: string }) => {
      const res = await scrape(params as never);
      return params.url.endsWith("/pricing") ? { ...res, cache_metadata: { status: "hit", age_ms: 60_000 } } : res;
    }) as unknown as typeof client.web.scrape;
    const site = await measureSite("example.com", client);
    expect(site.pages.filter((p) => p.cached).map((p) => p.role)).toEqual(["Pricing"]);
  });

  it("keeps the first key page's logo", async () => {
    const { client } = siteClient(URLS);
    const site = await measureSite("example.com", client);
    expect(site.logo).toBe("https://example.com/apple-touch-icon.png");
  });

  it("checks the usual address of each missing key page, and adds the ones that exist", async () => {
    const { client } = siteClient(["https://example.com/", "https://example.com/blog"]);
    const checked: string[] = [];
    const pageExists = async (url: string) => (checked.push(url), url.endsWith("/pricing") || url.endsWith("/about"));
    const site = await measureSite("example.com", client, { pageExists });
    expect(checked).toContain("https://example.com/pricing");
    expect(checked).toContain("https://example.com/docs");
    expect(site.pages.map((p) => p.role)).toEqual(["Home", "Pricing", "About"]);
  });

  it("does not check addresses for key pages Map already found", async () => {
    const { client } = siteClient(URLS);
    const checked: string[] = [];
    await measureSite("example.com", client, { pageExists: async (url) => (checked.push(url), false) });
    expect(checked).not.toContain("https://example.com/pricing");
  });

  it("re-measures a saved page list without calling Map", async () => {
    const { client, mapCalls, scraped } = siteClient(URLS);
    await measureSite("example.com", client, { pages: [{ role: "home", url: "https://example.com/" }] });
    expect(mapCalls()).toBe(0);
    expect(scraped).toEqual(["https://example.com/"]);
  });

  it("keeps going when one page fails", async () => {
    const { client } = siteClient(URLS, (url) => (url.endsWith("/pricing") ? new Error("timeout") : "word ".repeat(10)));
    const site = await measureSite("example.com", client);
    const pricing = site.pages.find((p) => p.role === "Pricing");
    expect(pricing?.error).toBeDefined();
    expect(pricing?.markdown).toBeNull();
    expect(site.pages.filter((p) => p.markdown)).toHaveLength(7);
  });

  it("picks key pages by address when the website has an llms.txt, and measures the files it lists", async () => {
    const { client, scraped } = siteClient(URLS, (url) => (url === "https://example.com/llms.txt" ? LLMS_TXT : "word ".repeat(10)));
    const site = await measureSite("example.com", client);
    expect(site.source).toBe("llms.txt");
    expect(site.llmsTxt).toBe("https://example.com/llms.txt");
    expect(site.pages.map((p) => p.role)).toEqual(["Home", "Product", "Docs", "Pricing", "API reference", "Integrations", "About", "Changelog", "OpenAPI spec"]);
    // Found on the main site, so the docs subdomain is not checked.
    expect(scraped[0]).toBe("https://example.com/llms.txt");
    expect(scraped).not.toContain("https://docs.example.com/llms.txt");
    // The file is measured but not added to the page total.
    const pageTokens = site.pages.filter((p) => !p.file).reduce((n, p) => n + (p.markdown?.tokens ?? 0), 0);
    expect(site.totalMarkdownTokens).toBe(pageTokens);
  });
});

describe("GET /api/website", () => {
  const get = (query: string) => new Request(`http://localhost/api/website${query}`);

  it("returns the site result and a pass/fail check", async () => {
    const res = await handleSite(get("?domain=example.com&maxTokens=1"), siteClient(URLS).client);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.domain).toBe("example.com");
    expect(body.check.result).toBe("fail");
  });

  it("rejects a bad domain", async () => {
    expect((await handleSite(get("?domain=localhost"), siteClient(URLS).client)).status).toBe(400);
  });
});
