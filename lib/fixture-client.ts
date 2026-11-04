import { existsSync, readFileSync } from "node:fs";
import type ContextDev from "context.dev";
import { MeasureError } from "./measure";

type Web = ContextDev["web"];
type ScrapeParams = Parameters<Web["scrape"]>[0];

// File name for a saved key page: "https://www.context.dev/pricing" -> "context-dev-pricing".
export const sitePageFixture = (url: string) => {
  const { host, pathname } = new URL(url);
  const name = `${host.replace(/^www\./, "")}${pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "").toLowerCase();
  return `site/${name}`;
};

// Fixture mode only: a short random wait, so the live progress view can be tried without credits.
const wait = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 1000));

// Fixture mode only: each answer reports 1 credit, as a real call would, so the daily limits can be tried. Nothing is spent.
const billed = <T extends object>(res: T) => ({ ...res, key_metadata: { credits_consumed: 1, credits_remaining: 0 } });

// Offline client for `npm run dev:fixtures`: answers every call from tests/fixtures/local. No key, no credits.
// That folder is git-ignored: it holds real page text and stays on the maintainer's computer.
// Saved pages return their own responses. Every other page returns docs.context.dev.
export function fixtureClient(): { web: Pick<Web, "scrape" | "mapUrls"> } {
  const load = (name: string) => {
    // The saved responses are real page text, kept only on the maintainer's computer. They are not in the repo.
    if (!existsSync("tests/fixtures/local")) {
      throw new MeasureError("Fixture mode needs saved responses in tests/fixtures/local, which are not in the repo. Run with a context.dev key instead.", "NO_FIXTURES");
    }
    return JSON.parse(readFileSync(`tests/fixtures/local/${name}.json`, "utf8"));
  };
  const kind = (p: ScrapeParams) =>
    p.markdownParams?.sourcePreference?.includes("markdown-direct") ? "published" : p.sharedParams?.mainContentOnly ? "main" : "full";

  return {
    web: {
      scrape: (async (params: ScrapeParams) => billed(await answer(params))) as Web["scrape"],
      mapUrls: (async (params: Parameters<Web["mapUrls"]>[0]) => billed(await map(params))) as unknown as Web["mapUrls"],
    },
  };

  async function answer(params: ScrapeParams) {
    await wait();
    const saved = sitePageFixture(params.url);
    const name = saved.slice("site/".length);
    // 1. Pages saved with all 3 calls (scripts/record-fixtures.ts): docs.context.dev and context.dev/pricing.
    if (existsSync(`tests/fixtures/local/${name}.${kind(params)}.json`)) return { ...load(`${name}.${kind(params)}`), url: params.url };
    // 2. Key pages (scripts/record-site.mts and scripts/record-missing.mts): the full page, plus main and published when saved.
    if (existsSync(`tests/fixtures/local/${saved}.json`)) {
      if (kind(params) === "full") return { ...load(saved), url: params.url };
      if (existsSync(`tests/fixtures/local/${saved}.${kind(params)}.json`)) return { ...load(`${saved}.${kind(params)}`), url: params.url };
      const page = load(saved);
      return { ...page, url: params.url, markdown: { requested: true, success: false, data: null, error_code: "NOT_SAVED", message: "Not saved in fixtures." } };
    }
    // 3. Any other page answers as docs.context.dev.
    return { ...load(`docs-context-dev.${kind(params)}`), url: params.url };
  }

  async function map({ domain }: { domain: string }) {
    await wait();
    // A saved real map of context.dev, if one was recorded. Otherwise a short made-up list.
    if (existsSync("tests/fixtures/local/map-context-dev.json")) return { ...load("map-context-dev"), domain };
    return {
      domain,
      request_id: "fixture",
      success: true,
      urls: ["/", "/pricing", "/docs", "/about", "/blog", "/changelog"].map((path) => ({ url: `https://${domain}${path}` })),
    };
  }
}
