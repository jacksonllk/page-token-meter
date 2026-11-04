import { randomUUID } from "node:crypto";
import type ContextDev from "context.dev";
import type { SiteEvent } from "./events";
import { llmsTxtCandidates, parseLlmsTxt, pickKeyPages, pool, type KeyPage } from "./keypages";
import { credits, MeasureError, size, TAGS, type TextSize } from "./measure";
import type { TextFetch } from "./plain-fetch";

export type SiteClient = { web: Pick<ContextDev["web"], "scrape" | "mapUrls"> };

export interface SitePage extends KeyPage {
  markdown: TextSize | null;
  html: TextSize | null;
  error?: string;
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
}

// Pass `pages` to re-measure a saved page list. Map returns different URLs between runs.
export async function measureSite(
  domain: string,
  client: SiteClient,
  // fetchText: download llms.txt directly (free), and ask context.dev only when that is blocked.
  options: { pages?: KeyPage[]; source?: PageSource; llmsTxt?: string | null; maxAgeMs?: number; onEvent?: (e: SiteEvent) => void; fetchText?: TextFetch } = {},
): Promise<SiteResult> {
  const { maxAgeMs, onEvent, fetchText } = options;
  const started = Date.now();
  const ms = () => Date.now() - started;
  let used = 0;
  let pages = options.pages;
  let source: PageSource = options.source ?? "pick";
  let llmsTxt = options.llmsTxt ?? null;

  if (!pages) {
    // 1 credit.
    const map = await client.web.mapUrls({ domain, includeSubdomains: true, maxLinks: 500, tags: TAGS });
    used += credits(map);
    onEvent?.({ type: "map", ms: ms(), urlCount: map.urls.length });
    const urls = map.urls.map((u) => u.url);

    // Downloaded directly for free. 1 credit per place only when the download is blocked and we ask context.dev, 2 at most.
    // The site's own list wins over our pick.
    // An llms.txt can add up to MAX_FILES files on top of the 8 pages.
    for (const url of llmsTxtCandidates(domain, urls)) {
      const listed = await readLlmsTxt(url);
      if (listed.length) {
        pages = listed;
        source = "llms.txt";
        llmsTxt = url;
        break;
      }
    }
    onEvent?.({ type: "llms", ms: ms(), url: llmsTxt });
    pages ??= pickKeyPages(domain, urls);
  }
  onEvent?.({ type: "picked", ms: ms(), pages, source });

  async function readLlmsTxt(url: string): Promise<KeyPage[]> {
    const got = await fetchText?.(url);
    if (got?.status === "ok") return parseLlmsTxt(got.text, domain);
    if (got?.status === "missing") return [];
    try {
      const res = await client.web.scrape({ url, formats: { markdown: true }, sharedParams: { mainContentOnly: false }, maxAgeMs, tags: TAGS });
      used += credits(res);
      return res.markdown.success && res.markdown.data ? parseLlmsTxt(res.markdown.data, domain) : [];
    } catch {
      return [];
    }
  }

  // 1 credit per page, 2 at a time. Full page only: no main-content call and no published check.
  const indexed = pages.map((page, index) => ({ page, index }));
  const measured = await pool(indexed, 2, async ({ page, index }): Promise<SitePage> => {
    onEvent?.({ type: "page-start", ms: ms(), index });
    const result = await measurePage(page);
    onEvent?.({ type: "page", ms: ms(), index, markdown: result.markdown, error: result.error });
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
      return { ...page, markdown: size(res.markdown.data), html: size(res.html.success ? (res.html.data ?? "") : "") };
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
  };
}
