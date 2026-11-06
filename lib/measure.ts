import { createHash, randomUUID } from "node:crypto";
import type ContextDev from "context.dev";
import type { MeasureEvent } from "./events";
import { fileType } from "./files";
import { HEAT_CELLS, heatLevels, linkSquares } from "./heat";
import { pickLogo } from "./logo";
import type { TextFetch } from "./plain-fetch";
import { countTokens, equalTokenStarts, TOKENIZER, tokenStarts } from "./tokens";

// How much of the Markdown the text panel under the reading-order map shows.
export const PREVIEW_CHARS = 40000;
export const TAGS = ["page-token-meter"];

// Only the part of the SDK client that measure() uses. Tests pass a fake with the same shape.
export type ScrapeClient = { web: Pick<ContextDev["web"], "scrape"> };
type ScrapeResponse = Awaited<ReturnType<ContextDev["web"]["scrape"]>>;

export interface TextSize {
  tokens: number;
  chars: number;
}

// A run of Markdown lines that are either main content or navigation and footer.
export interface Segment {
  text: string;
  main: boolean;
}

// A stretch of the page in reading order: tokens, whether it is main content, its length and its first line.
// chars counts each line plus its line break, the same way as the preview, so runs line up with the preview text.
export interface Run {
  main: boolean;
  tokens: number;
  chars: number;
  text: string;
}

export interface Breakdown {
  // Before the main content starts: top menus, banners.
  before: number;
  main: number;
  // After the main content starts but not part of it: sidebars, footer.
  after: number;
}

// Files the page itself points to for AI tools.
export interface DeclaredLinks {
  markdown: string | null;
  llmsTxt: string | null;
  // A Markdown link the page declares for a different address, such as a site-wide /auth.md.
  otherMarkdown: string | null;
}

// cached: the steps context.dev answered from a copy it had already made.
export type PageSteps = { full?: number; main?: number; published?: number; total: number; cached?: MeasureEvent["type"][] };

export interface Measurement {
  id: string;
  url: string;
  measuredAt: string;
  tokenizer: typeof TOKENIZER;
  markdown: TextSize & { textHash: string };
  // null when the main-content call failed.
  mainContent: TextSize | null;
  html: TextSize;
  // "unknown" when the check failed for a reason other than "no published Markdown". "skipped" for a file.
  // "unconfirmed" when the Markdown returned belongs to another address (a site-wide link), so we cannot tell.
  // url: the page's own Markdown file, when the page declares one (link rel="alternate" type="text/markdown").
  published: { status: "offered" | "not_offered" | "unknown" | "unconfirmed" | "skipped"; tokens?: number; chars?: number; url?: string };
  // The file type ("JSON", "Markdown"...) when the address is a file, not a web page. null for a web page.
  file: string | null;
  // The site's llms.txt (an index file for AI tools), when the page declares one.
  llmsTxt: string | null;
  // Approximate split of the Markdown tokens, top to bottom. null when the main content is unknown.
  breakdown: Breakdown | null;
  // The whole page in reading order, as runs of main content and navigation. null when the main content is unknown.
  readingOrder: Run[] | null;
  // The token map (lib/heat.ts): HEAT_CELLS squares in reading order, 1 for main content. No page text, so share copies keep it.
  // null when the main content is unknown. Missing on results saved before 4 Nov.
  heat?: number[] | null;
  // Where each square of the token map starts in the Markdown, in characters. Missing on results saved before 6 Nov.
  squares?: number[] | null;
  // The token map squares whose tokens are mostly link addresses (1), and how many tokens are link addresses.
  // Missing on results saved before 6 Nov.
  links?: { squares: number[]; tokens: number } | null;
  // When each step finished, in ms from the start, so a saved result shows the times of the check that made it.
  // Missing on results saved before 5 Nov.
  steps?: PageSteps;
  // The website's logo (lib/logo.ts), from this page's HTML. null for a file. Missing on results saved before 5 Nov.
  logo?: string | null;
  // Characters of navigation an agent reads before the main content. null when unknown.
  contentStartChar: number | null;
  // The first PREVIEW_CHARS characters of the Markdown, split into main content and navigation.
  preview: Segment[];
  saved: boolean;
  creditsUsed: number;
}

export class MeasureError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "MeasureError";
  }
}

export function size(text: string): TextSize {
  return { tokens: countTokens(text), chars: text.length };
}

export function credits(...responses: ({ key_metadata?: { credits_consumed: number } } | null)[]) {
  return responses.reduce((sum, r) => sum + (r?.key_metadata?.credits_consumed ?? 0), 0);
}

// A failed side call (main content, published check) should not sink the whole result.
async function settle(p: Promise<ScrapeResponse>): Promise<ScrapeResponse | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

// maxAgeMs 0: context.dev loads the page now instead of answering with a copy it saved (by default up to 3 days old).
export const FRESH = 0;

// True when context.dev answered with a copy it had already made, not a fresh load.
export function fromCache(res: { cache_metadata?: { status: string } } | null | undefined): boolean {
  return res?.cache_metadata?.status === "hit";
}

export async function measure(
  url: string,
  client: ScrapeClient,
  // fetchText: download the page's own Markdown directly (free), and ask context.dev only when that is blocked.
  // Without it, the published check is always a context.dev call (tests, fixture mode).
  options: { maxAgeMs?: number; onEvent?: (e: MeasureEvent) => void; fetchText?: TextFetch } = {},
): Promise<Measurement> {
  // A fresh capture unless the caller says otherwise: context.dev's saved copy can be up to 3 days old.
  const { maxAgeMs = FRESH, fetchText } = options;
  const started = Date.now();
  const ms = () => Date.now() - started;
  // Sends each step as it finishes and notes when it finished.
  const steps: Omit<PageSteps, "total"> = {};
  const onEvent = (e: MeasureEvent) => {
    steps[e.type] = e.ms;
    if (e.cached) (steps.cached ??= []).push(e.type);
    options.onEvent?.(e);
  };

  // A file (an OpenAPI spec, a .md page...) has no menus or footer and no separate Markdown version.
  // One call is enough: all of it is content.
  const file = fileType(url);
  if (file) return { ...(await measureFile(url, file, client, { maxAgeMs, onEvent, ms })), steps: { ...steps, total: ms() } };

  // 3 calls, at most 2 at a time (free tier limit). 1 credit each.
  // Each result is reported the moment it arrives.
  const fullCall = client.web.scrape({ url, formats: { markdown: true, html: true }, sharedParams: { mainContentOnly: false }, maxAgeMs, tags: TAGS });
  const mainCall = settle(client.web.scrape({ url, formats: { markdown: true }, sharedParams: { mainContentOnly: true }, maxAgeMs, tags: TAGS }));

  const fullDone = fullCall.then((full) => {
    const markdown = full.markdown.success ? full.markdown.data : null;
    if (markdown === null) {
      throw new MeasureError(full.markdown.message ?? "context.dev returned no Markdown for this page.", full.markdown.error_code ?? "NO_MARKDOWN");
    }
    const md = size(markdown);
    const html = size(full.html.success ? (full.html.data ?? "") : "");
    const links = declaredLinks(full);
    onEvent({ type: "full", ms: ms(), markdown: md, html, links, cached: fromCache(full) });
    return { full, markdown, md, html, links };
  });
  const mainDone = mainCall.then((main) => {
    const text = main?.markdown.success ? main.markdown.data : null;
    const mainContent = text === null ? null : size(text);
    onEvent({ type: "main", ms: ms(), mainContent, cached: fromCache(main) });
    return { main, text, mainContent };
  });

  // 1 credit: context.dev's published-Markdown check. It follows the Markdown link the page declares.
  // When that link is for another address (a site-wide file such as /auth.md) and none is declared for this page,
  // the text is not this page's Markdown, and we cannot tell whether the page has its own.
  const askContextDev = () =>
    settle(client.web.scrape({ url, formats: { markdown: true }, markdownParams: { sourcePreference: ["markdown-direct"] }, maxAgeMs, tags: TAGS })).then(
      async (res) => {
        const links = await fullDone.then((f) => f.links, () => null);
        let published = publishedStatus(res);
        if (published.status === "offered" && links && !links.markdown && links.otherMarkdown) published = { status: "unconfirmed" };
        return { res, published };
      },
    );

  // Free: the page's HTML (from the full-page call) says whether it has its own Markdown file. Download that file directly.
  // No link means no published Markdown, as context.dev would also find. context.dev is asked only when the download is blocked.
  const checkDirectly = async (links: DeclaredLinks, fetch: TextFetch): Promise<{ res: ScrapeResponse | null; published: Measurement["published"] }> => {
    if (!links.markdown) return { res: null, published: { status: links.otherMarkdown ? "unconfirmed" : "not_offered" } };
    const got = await fetch(links.markdown);
    if (got.status === "ok") return { res: null, published: { status: "offered", ...size(got.text) } };
    if (got.status === "missing") return { res: null, published: { status: "not_offered" } };
    return askContextDev();
  };

  let publishedDone: Promise<{ res: ScrapeResponse | null; published: Measurement["published"] }>;
  if (fetchText) {
    publishedDone = fullDone.then(({ links }) => checkDirectly(links, fetchText));
  } else {
    // The check starts as soon as one of the first two calls is done.
    // If the full page failed first, stop here: no point spending a credit on the check.
    const fullOk = await Promise.race([fullDone.then(() => true, () => false), mainDone.then(() => true)]);
    if (!fullOk) await fullDone;
    publishedDone = askContextDev();
  }
  publishedDone = publishedDone.then((p) => {
    onEvent({ type: "published", ms: ms(), published: p.published, cached: fromCache(p.res) });
    return p;
  });

  const [{ full, markdown, md, html, links }, { main, text, mainContent }, { res, published }] = await Promise.all([fullDone, mainDone, publishedDone]);
  const { contentStartChar, preview } = splitPreview(markdown, text);
  const split = contentStartChar !== null && text !== null;
  const breakdown = split ? splitTokens(markdown, text, contentStartChar, md.tokens) : null;
  const order = split ? readingOrder(markdown, text, contentStartChar) : null;
  const tokenAt = tokenStarts(markdown);
  const squares = equalTokenStarts(markdown, HEAT_CELLS, tokenAt);
  const heat = order ? heatLevels(markdown.length, order, squares) : null;
  return {
    id: randomUUID(),
    url,
    measuredAt: new Date().toISOString(),
    tokenizer: TOKENIZER,
    markdown: { ...md, textHash: createHash("sha256").update(markdown).digest("hex") },
    mainContent,
    html,
    published: published.status === "offered" && links.markdown ? { ...published, url: links.markdown } : published,
    file: null,
    llmsTxt: links.llmsTxt,
    breakdown,
    readingOrder: order,
    heat,
    squares,
    links: linkSquares(markdown, tokenAt),
    contentStartChar,
    preview,
    saved: false,
    creditsUsed: credits(full, main, res),
    steps: { ...steps, total: ms() },
    logo: pickLogo(full.html.success ? (full.html.data ?? "") : "", url),
  };
}

async function measureFile(
  url: string,
  file: string,
  client: ScrapeClient,
  { maxAgeMs, onEvent, ms }: { maxAgeMs?: number; onEvent?: (e: MeasureEvent) => void; ms: () => number },
): Promise<Measurement> {
  const full = await client.web.scrape({ url, formats: { markdown: true, html: true }, sharedParams: { mainContentOnly: false }, maxAgeMs, tags: TAGS });
  const markdown = full.markdown.success ? full.markdown.data : null;
  if (markdown === null) {
    throw new MeasureError(full.markdown.message ?? "context.dev returned no text for this file.", full.markdown.error_code ?? "NO_MARKDOWN");
  }
  const md = size(markdown);
  const html = size(full.html.success ? (full.html.data ?? "") : "");
  onEvent?.({ type: "full", ms: ms(), markdown: md, html, links: { markdown: null, llmsTxt: null, otherMarkdown: null }, cached: fromCache(full) });
  onEvent?.({ type: "main", ms: ms(), mainContent: md });
  onEvent?.({ type: "published", ms: ms(), published: { status: "skipped" } });
  return {
    id: randomUUID(),
    url,
    measuredAt: new Date().toISOString(),
    tokenizer: TOKENIZER,
    markdown: { ...md, textHash: createHash("sha256").update(markdown).digest("hex") },
    mainContent: md,
    html,
    published: { status: "skipped" },
    file,
    llmsTxt: null,
    breakdown: { before: 0, main: md.tokens, after: 0 },
    readingOrder: [{ main: true, tokens: md.tokens, chars: markdown.length + 1, text: firstLine(markdown) }],
    // A file is all content: every square is main content.
    heat: Array<number>(HEAT_CELLS).fill(1),
    squares: equalTokenStarts(markdown, HEAT_CELLS),
    links: linkSquares(markdown, tokenStarts(markdown)),
    contentStartChar: 0,
    preview: [{ text: markdown.slice(0, PREVIEW_CHARS) + "\n", main: true }],
    saved: false,
    creditsUsed: credits(full),
  };
}

function publishedStatus(res: ScrapeResponse | null): Measurement["published"] {
  if (res?.markdown.success) {
    return res.markdown.data === null ? { status: "offered" } : { status: "offered", ...size(res.markdown.data) };
  }
  if (res?.markdown.error_code === "NO_PUBLISHED_MARKDOWN") return { status: "not_offered" };
  return { status: "unknown" };
}

export { navFooterShare } from "./metrics";

const norm = (line: string) => line.replace(/\s+/g, " ").trim();

// Marks which lines of the full Markdown are main content, by matching them against the main-content Markdown.
// Approximate: short lines (under 20 characters) cannot mark where the main content starts.
export function splitPreview(full: string, main: string | null): { contentStartChar: number | null; preview: Segment[] } {
  const text = full.slice(0, PREVIEW_CHARS);
  const mainLines = new Set((main ?? "").split("\n").map(norm).filter(Boolean));

  // Content starts at the first long main-content line whose next line is main content too.
  // A lone match, such as a site-wide banner that the main-content version also keeps, does not count.
  // If no line has a main-content neighbour, the first lone match is used.
  let start = -1;
  let lone = -1;
  const lines = full.split("\n");
  for (let pos = 0, i = 0; i < lines.length; pos += lines[i].length + 1, i++) {
    const n = norm(lines[i]);
    if (n.length < 20 || !mainLines.has(n)) continue;
    const next = lines.slice(i + 1).map(norm).find(Boolean);
    if (next !== undefined && mainLines.has(next)) {
      start = pos;
      break;
    }
    if (lone < 0) lone = pos;
  }
  if (start < 0) start = lone;
  if (start < 0) return { contentStartChar: null, preview: [{ text, main: true }] };

  const preview: Segment[] = [];
  let pos = 0;
  let prevMain = false;
  for (const line of text.split("\n")) {
    const n = norm(line);
    // Blank lines follow the line before them.
    const isMain: boolean = pos >= start && (n === "" ? prevMain : mainLines.has(n));
    const last = preview.at(-1);
    if (last && last.main === isMain) last.text += line + "\n";
    else preview.push({ text: line + "\n", main: isMain });
    prevMain = isMain;
    pos += line.length + 1;
  }
  return { contentStartChar: start, preview };
}

// Splits the full Markdown into before, main and after, using the same line matching as splitPreview.
// "main" is the total minus the other two, so the three always add up to the page's token count.
export function splitTokens(full: string, main: string, start: number, total: number): Breakdown {
  const mainLines = new Set(main.split("\n").map(norm).filter(Boolean));
  let after = "";
  let pos = 0;
  for (const line of full.split("\n")) {
    const n = norm(line);
    if (pos >= start && n !== "" && !mainLines.has(n)) after += line + "\n";
    pos += line.length + 1;
  }
  const before = countTokens(full.slice(0, start));
  const afterTokens = Math.min(countTokens(after), Math.max(0, total - before));
  return { before, main: Math.max(0, total - before - afterTokens), after: afterTokens };
}

// Splits the full Markdown into runs of main content and navigation, top to bottom, using the same line matching.
// Each run keeps its token count and its first line as plain text, for the reading-order map.
export function readingOrder(full: string, main: string, start: number): Run[] {
  const mainLines = new Set(main.split("\n").map(norm).filter(Boolean));
  const runs: { main: boolean; text: string }[] = [];
  let pos = 0;
  let prevMain = false;
  for (const line of full.split("\n")) {
    const n = norm(line);
    const isMain: boolean = pos >= start && (n === "" ? prevMain : mainLines.has(n));
    const last = runs.at(-1);
    if (last && last.main === isMain) last.text += line + "\n";
    else runs.push({ main: isMain, text: line + "\n" });
    prevMain = isMain;
    pos += line.length + 1;
  }
  return runs.map((r) => ({ main: r.main, tokens: countTokens(r.text), chars: r.text.length, text: firstLine(r.text) }));
}

// The first non-empty line of a run, without Markdown link targets and markers, cut to 90 characters.
function firstLine(text: string): string {
  const line = text.split("\n").map(norm).find(Boolean) ?? "";
  const plain = line
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[[\]*_`>#\\]/g, "")
    .replace(/^[-+] /, "")
    .trim();
  return plain.length > 90 ? plain.slice(0, 89) + "…" : plain;
}

// Reads the page's own declarations: <link rel="alternate" type="text/markdown"> for this page, and an llms.txt.
export function declaredLinks(res: Pick<ScrapeResponse, "url" | "metadata">): DeclaredLinks {
  const alternates = res.metadata?.alternates ?? [];
  const path = (href: string) => {
    try {
      return new URL(href).pathname.replace(/\.md$/i, "").replace(/\/(index)?$/i, "");
    } catch {
      return null;
    }
  };
  const pagePath = path(res.metadata?.canonicalUrl ?? res.url);
  const markdownLinks = alternates.filter((a) => /markdown/i.test(a.type ?? ""));
  const markdown = markdownLinks.find((a) => path(a.href) === pagePath)?.href ?? null;
  const otherMarkdown = markdownLinks.find((a) => path(a.href) !== pagePath)?.href ?? null;
  const llmsTxt = alternates.find((a) => /\/llms\.txt$/i.test(a.href))?.href ?? null;
  return { markdown, llmsTxt, otherMarkdown };
}
