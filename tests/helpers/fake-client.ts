import { existsSync, readFileSync } from "node:fs";
import type { ScrapeClient } from "@/lib/measure";

type Params = Parameters<ScrapeClient["web"]["scrape"]>[0];
type Response = Awaited<ReturnType<ScrapeClient["web"]["scrape"]>>;

// Real context.dev responses live in tests/fixtures/local, on the maintainer's computer only. Git ignores that folder.
// Tests that check real page numbers run only where it exists. GitHub's CI skips them.
export const HAS_SAVED_PAGES = existsSync("tests/fixtures/local/docs-context-dev.full.json");

export function fixture(name: string): Response {
  return JSON.parse(readFileSync(`tests/fixtures/local/${name}.json`, "utf8"));
}

// Which of the 3 measure() calls this is: full page, main content, or published check.
export function callKind(params: Params): "full" | "main" | "published" {
  if (params.markdownParams?.sourcePreference?.includes("markdown-direct")) return "published";
  if (params.sharedParams?.mainContentOnly) return "main";
  return "full";
}

// A stand-in for the context.dev client. Returns saved responses and never calls the API.
export function fakeClient(responses: Partial<Record<ReturnType<typeof callKind>, Response | Error>>) {
  const calls: Params[] = [];
  const client: ScrapeClient = {
    web: {
      scrape: (async (params: Params) => {
        calls.push(params);
        const res = responses[callKind(params)];
        if (!res) throw new Error(`No fake response for ${callKind(params)} call`);
        if (res instanceof Error) throw res;
        return res;
      }) as ScrapeClient["web"]["scrape"],
    },
  };
  return { client, calls };
}

export function pageClient(page: string, published = `${page}.published`) {
  return fakeClient({ full: fixture(`${page}.full`), main: fixture(`${page}.main`), published: fixture(published) });
}

// A made-up scrape response, for tests that only need the shape. null markdown means the page failed to load.
export function fakeResponse(markdown: string | null, html = "<html><body></body></html>"): Response {
  const off = { requested: false, success: null, data: null };
  return {
    url: "https://example.com/",
    request_id: "test",
    markdown:
      markdown === null
        ? { requested: true, success: false, data: null, error_code: "FETCH_FAILED", message: "Could not load the page." }
        : { requested: true, success: true, data: markdown },
    html: { requested: true, success: true, data: html },
    metadata: {},
    cache_metadata: { status: "miss", age_ms: 0 },
    bytes: off,
    highlights: off,
    images: off,
    json: off,
    parsed: { type: "custom", ...off },
    product: off,
    profile: null,
    screenshot: off,
  } as unknown as Response;
}

// A made-up page: menus, the content, then a footer. MAIN is what a main-content scrape would keep.
export const EXAMPLE_FULL = [
  "[Home](/) [Product](/product) [Pricing](/pricing) [Docs](/docs) [Sign in](/login)",
  "# Getting started with the Example API",
  "Install the package, add your key and make your first request in a few minutes.",
  "## Next steps",
  "Read the API reference to see every endpoint and its options.",
  "[Privacy](/privacy) [Terms](/terms) © 2026 Example Inc.",
].join("\n");
export const EXAMPLE_MAIN = EXAMPLE_FULL.split("\n").slice(1, 5).join("\n");

// All three measure() calls answered with the made-up page. Works without the local folder.
export function exampleClient() {
  return fakeClient({ full: fakeResponse(EXAMPLE_FULL), main: fakeResponse(EXAMPLE_MAIN), published: fakeResponse(EXAMPLE_MAIN) });
}
