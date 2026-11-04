import type { PageStreamEvent, SiteStreamEvent } from "@/lib/events";
import type { KeyPage } from "@/lib/keypages";
import type { DeclaredLinks, Measurement, TextSize } from "@/lib/measure";
import type { PageSource, SiteResult } from "@/lib/site";

export type ApiError = { error: string; code: string };

// What the page knows about a Page view run so far, built up from live events.
// ms is when a step finished. It is missing for a saved result (cache or share link): no step ran now.
export interface PageRun {
  url: string;
  startedAt: number;
  finishedAt?: number;
  // True when the result came from the cache or a share link, with no live steps.
  saved?: boolean;
  full?: { ms?: number; markdown: TextSize; html: TextSize; links: DeclaredLinks };
  main?: { ms?: number; mainContent: TextSize | null };
  published?: { ms?: number; published: Measurement["published"] };
  result?: Measurement;
  error?: ApiError;
}

export interface SitePageRun extends KeyPage {
  state: "waiting" | "live" | "done" | "failed";
  ms?: number;
  markdown?: TextSize | null;
  error?: string;
}

export interface SiteRun {
  domain: string;
  startedAt: number;
  finishedAt?: number;
  saved?: boolean;
  map?: { ms: number; urlCount: number };
  // url is null when the site has no llms.txt we could read.
  llms?: { ms?: number; url: string | null };
  picked?: { ms?: number; source: PageSource };
  pages?: SitePageRun[];
  result?: SiteResult;
  error?: ApiError;
}

export function applyPageEvent(run: PageRun, e: PageStreamEvent): PageRun {
  switch (e.type) {
    case "full":
      return { ...run, full: e };
    case "main":
      return { ...run, main: e };
    case "published":
      return { ...run, published: e };
    case "done":
      return run.full ? { ...run, result: e.result, finishedAt: Date.now() } : savedPageRun(run, e.result);
    case "error":
      return { ...run, error: { error: e.error, code: e.code }, finishedAt: Date.now() };
  }
}

// A saved result arrives alone. Every step is done, with no step times.
export function savedPageRun(run: PageRun, m: Measurement): PageRun {
  return {
    ...run,
    saved: true,
    finishedAt: run.startedAt,
    full: { markdown: m.markdown, html: m.html, links: { markdown: m.published.url ?? null, llmsTxt: m.llmsTxt, otherMarkdown: null } },
    main: { mainContent: m.mainContent },
    published: { published: m.published },
    result: m,
  };
}

export function savedSiteRun(run: SiteRun, r: SiteResult): SiteRun {
  return {
    ...run,
    saved: true,
    finishedAt: run.startedAt,
    llms: { url: r.llmsTxt },
    picked: { source: r.source },
    pages: r.pages.map((p) => ({ ...p, state: p.markdown ? "done" : "failed" })),
    result: r,
  };
}

export function applySiteEvent(run: SiteRun, e: SiteStreamEvent): SiteRun {
  switch (e.type) {
    case "map":
      return { ...run, map: e };
    case "llms":
      return { ...run, llms: { ms: e.ms, url: e.url } };
    case "picked":
      return { ...run, picked: { ms: e.ms, source: e.source }, pages: e.pages.map((p) => ({ ...p, state: "waiting" })) };
    case "page-start":
      return { ...run, pages: run.pages?.map((p, i) => (i === e.index ? { ...p, state: "live" } : p)) };
    case "page":
      return {
        ...run,
        pages: run.pages?.map((p, i) => (i === e.index ? { ...p, state: e.markdown ? "done" : "failed", ms: e.ms, markdown: e.markdown, error: e.error } : p)),
      };
    case "done":
      return run.picked ? { ...run, result: e.result, finishedAt: Date.now() } : savedSiteRun(run, e.result);
    case "error":
      return { ...run, error: { error: e.error, code: e.code }, finishedAt: Date.now() };
  }
}

// Reads a stream of JSON lines and calls onEvent for each. Returns an error if the request itself failed.
export async function readEvents<E>(path: string, onEvent: (e: E) => void): Promise<ApiError | null> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    return { error: "Could not reach the server. Try again.", code: "NETWORK" };
  }
  if (!res.ok || !res.body) {
    try {
      return await res.json();
    } catch {
      return { error: "Something went wrong. Try again.", code: "UNKNOWN" };
    }
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  return null;
}
