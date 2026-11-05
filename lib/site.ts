import { randomUUID } from "node:crypto";
import type ContextDev from "context.dev";
import type { SiteEvent } from "./events";
import { llmsTxtCandidates, MAP_LIMIT, maxKeyPages, parseLlmsTxt, pickKeyPages, pool, type KeyPage } from "./keypages";
import { credits, FRESH, fromCache, MeasureError, size, TAGS, type TextSize } from "./measure";
import { pickLogo } from "./logo";
import type { TextFetch } from "./plain-fetch";

export type SiteClient = { web: Pick<ContextDev["web"], "scrape" | "mapUrls"> };

export interface SitePage extends KeyPage {
  markdown: TextSize | null;
  html: TextSize | null;
  error?: string;
  // When this page finished, in ms from the start of the check. Missing on results saved before 5 Nov.
  ms?: number;
  // context.dev answered with a copy it had already made, not a fresh load.
  cached?: boolean;
}

// Who chose the pages: the site's own llms.txt, or our pick by address.
export type PageSource = "llms.txt" | "pick";

export interface SiteResult {
  id: string;
  domain: string;
  measuredAt: string;
  source: PageSource;
  // The llms.txt the pages came from, when source is "llms.txt".
  llmsTxt: string | null;
  pages: SitePage[];
  totalMarkdownTokens: number;
  heaviest: { role: string; url: string; tokens: number } | null;
  creditsUsed: number;
  // The page limit the check ran with (MAX_KEY_PAGES). Missing on results saved before 4 Nov: 8.
  maxPages?: number;
  // When each step finished, in ms from the start, so a saved result shows the times of the check that made it.
  // map and llms are missing when a saved page list was re-measured. Missing on results saved before 5 Nov.
  steps?: { map?: { ms: number; urlCount: number }; llms?: number; picked: number; total: number };
  // The website's logo (lib/logo.ts), from the first key page that loaded, usually the home page.
  // Missing on results saved before 5 Nov.
  logo?: string | null;
}

// Pass `pages` to re-measure a saved page list. Map returns different URLs between runs.
export async function measureSite(
  domain: string,
  client: SiteClient,
  // fetchText: download llms.txt directly (free), and ask context.dev only when that is blocked.
  options: { pages?: KeyPage[]; source?: PageSource; llmsTxt?: string | null; maxAgeMs?: number; onEvent?: (e: SiteEvent) => void; fetchText?: TextFetch } = {},
): Promise<SiteResult> {
  // A fresh capture of every page, as in measure().
  const { maxAgeMs = FRESH, onEvent, fetchText } = options;
  const max = maxKeyPages();
  const started = Date.now();
  const ms = () => Date.now() - started;
  let used = 0;
  let pages = options.pages;
  let source: PageSource = options.source ?? "pick";
  let llmsTxt = options.llmsTxt ?? null;
  const steps: { map?: { ms: number; urlCount: number }; llms?: number } = {};

  if (!pages) {
    // 1 credit.
    const map = await client.web.mapUrls({ domain, includeSubdomains: true, maxLinks: MAP_LIMIT, tags: TAGS });
    used += credits(map);
    steps.map = { ms: ms(), urlCount: map.urls.length };
    onEvent?.({ type: "map", ...steps.map });
    const urls = map.urls.map((u) => u.url);

    // Downloaded directly for free. 1 credit per place only when the download is blocked and we ask context.dev, 2 at most.
    // The site's own list wins over our pick.
    // An llms.txt can add up to MAX_FILES files on top of the pages.
    for (const url of llmsTxtCandidates(domain, urls)) {
      const listed = await readLlmsTxt(url);
      if (listed.length) {
        pages = listed;
        source = "llms.txt";
        llmsTxt = url;
        break;
      }
    }
    steps.llms = ms();
    onEvent?.({ type: "llms", ms: steps.llms, url: llmsTxt });
    pages ??= pickKeyPages(domain, urls, max);
  }
  const picked = ms();
  onEvent?.({ type: "picked", ms: picked, pages, source, max });

  async function readLlmsTxt(url: string): Promise<KeyPage[]> {
    const got = await fetchText?.(url);
    if (got?.status === "ok") return parseLlmsTxt(got.text, domain, max);
    if (got?.status === "missing") return [];
    try {
      const res = await client.web.scrape({ url, formats: { markdown: true }, sharedParams: { mainContentOnly: false }, maxAgeMs, tags: TAGS });
      used += credits(res);
      return res.markdown.success && res.markdown.data ? parseLlmsTxt(res.markdown.data, domain, max) : [];
    } catch {
      return [];
    }
  }

  // Each page's logo, from its HTML. The result keeps the first page's (lib/logo.ts).
  const logos = new Map<string, string | null>();

  // 1 credit per page, 2 at a time. Full page only: no main-content call and no published check.
  const indexed = pages.map((page, index) => ({ page, index }));
  const measured = await pool(indexed, 2, async ({ page, index }): Promise<SitePage> => {
    onEvent?.({ type: "page-start", ms: ms(), index });
    const result = { ...(await measurePage(page)), ms: ms() };
    onEvent?.({ type: "page", ms: result.ms, index, markdown: result.markdown, error: result.error, cached: result.cached });
    return result;
  });

  async function measurePage(page: KeyPage): Promise<SitePage> {
    try {
      const res = await client.web.scrape({
        url: page.url,
        formats: { markdown: true, html: true },
        sharedParams: { mainContentOnly: false },
        maxAgeMs,
        tags: TAGS,
      });
      used += credits(res);
      if (!res.markdown.success || res.markdown.data === null) {
        return { ...page, markdown: null, html: null, error: res.markdown.message ?? "No Markdown returned." };
      }
      const html = res.html.success ? (res.html.data ?? "") : "";
      if (!page.file) logos.set(page.url, pickLogo(html, page.url));
      return { ...page, markdown: size(res.markdown.data), html: size(html), cached: fromCache(res) };
    } catch {
      return { ...page, markdown: null, html: null, error: "Could not fetch this page." };
    }
  }

  // The total and the heaviest are about pages. Files are measured and listed, but not added in.
  const ok = measured.filter((p) => p.markdown);
  if (ok.length === 0) throw new MeasureError("None of the key pages could be measured.", "NO_PAGES");
  const okPages = ok.filter((p) => !p.file);
  const heaviest = okPages.length ? okPages.reduce((a, b) => (b.markdown!.tokens > a.markdown!.tokens ? b : a)) : null;

  return {
    id: randomUUID(),
    domain,
    measuredAt: new Date().toISOString(),
    source,
    llmsTxt,
    pages: measured,
    totalMarkdownTokens: okPages.reduce((sum, p) => sum + p.markdown!.tokens, 0),
    heaviest: heaviest ? { role: heaviest.role, url: heaviest.url, tokens: heaviest.markdown!.tokens } : null,
    creditsUsed: used,
    maxPages: max,
    steps: { ...steps, picked, total: ms() },
    logo: ok.filter((p) => !p.file).map((p) => logos.get(p.url)).find(Boolean) ?? null,
  };
}
