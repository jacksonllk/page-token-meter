// Picks a site's key pages: the pages its llms.txt lists, or our pick by address.

import { llmsEntryKind } from "./files";

export const MAX_PAGES = 8;
// Files an llms.txt points to (OpenAPI specs, llms-full.txt) are measured too, but listed apart from the pages.
export const MAX_FILES = 2;

export interface KeyPage {
  role: string;
  url: string;
  // true for a file (not counted in the page total).
  file?: boolean;
}

const isRoot = (u: URL) => (u.pathname === "/" || u.pathname === "") && !u.search;
const depth = (u: URL) => u.pathname.split("/").filter(Boolean).length;
const onDocs = (u: URL) => /^docs\./i.test(u.hostname);

// Our pick when a site has no llms.txt. Built for software and developer tools:
// what a technical buyer checks first. Blog, news, about and customers pages are left out.
// Candidate roles in priority order. For each role, the shallowest matching address wins (an index before a deep page).
const RULES: [string, (u: URL, domain: string) => boolean][] = [
  ["home", (u, domain) => isRoot(u) && (u.hostname === domain || u.hostname === `www.${domain}`)],
  ["pricing", (u) => /^\/(pricing|plans)\/?$/i.test(u.pathname)],
  [
    "docs start",
    (u) => (onDocs(u) && isRoot(u)) || /^\/docs\/?$/i.test(u.pathname) || /^(\/docs)?\/(introduction|overview)\/?$/i.test(u.pathname),
  ],
  ["quickstart", (u) => /^(\/docs)?\/(quickstart|quick-start|getting-started|get-started)\/?$/i.test(u.pathname)],
  ["API reference", (u) => /^(\/docs)?\/(api-reference|api|reference)(\/|$)/i.test(u.pathname)],
  ["product", (u) => !onDocs(u) && /^\/(product|products|platform|features)\/?$/i.test(u.pathname)],
  ["integrations", (u) => /^(\/docs)?\/(integrations|sdks|sdk|libraries)\/?$/i.test(u.pathname)],
  ["changelog", (u) => /^(\/docs)?\/(changelog|releases|whats-new)\/?$/i.test(u.pathname)],
  ["security", (u) => /^\/(security|trust)\/?$/i.test(u.pathname) || (/^trust\./i.test(u.hostname) && isRoot(u))],
  ["docs article", (u) => (/\/docs\//i.test(u.pathname) && depth(u) >= 3) || (onDocs(u) && depth(u) >= 2)],
];

export function pickKeyPages(domain: string, urls: string[], max = MAX_PAGES): KeyPage[] {
  const parsed = urls.flatMap((url) => {
    try {
      return [new URL(url)];
    } catch {
      return [];
    }
  });
  const picked: KeyPage[] = [];
  const seen = new Set<string>();
  for (const [role, test] of RULES) {
    const hits = parsed.filter((u) => test(u, domain) && !seen.has(u.href));
    const hit = hits.reduce<URL | undefined>((best, u) => (!best || depth(u) < depth(best) ? u : best), undefined);
    if (hit) {
      picked.push({ role, url: hit.href });
      seen.add(hit.href);
    }
  }
  // Map does not always list the home page. Always measure it.
  if (!picked.some((p) => p.role === "home")) picked.unshift({ role: "home", url: `https://${domain}/` });
  return picked.slice(0, max);
}

// Where a site's llms.txt may live: the main site first, then the docs subdomain if Map found one.
export function llmsTxtCandidates(domain: string, urls: string[]): string[] {
  const hosts = new Set(urls.flatMap((url) => (URL.canParse(url) ? [new URL(url).hostname.toLowerCase()] : [])));
  const main = hosts.has(`www.${domain}`) && !hosts.has(domain) ? `www.${domain}` : domain;
  const candidates = [`https://${main}/llms.txt`];
  if (hosts.has(`docs.${domain}`)) candidates.push(`https://docs.${domain}/llms.txt`);
  return candidates;
}

// Reads an llms.txt (llmstxt.org): a "# Title" line, then sections of "- [Name](url)" links.
// Returns the first pages (up to max) and files (up to MAX_FILES) it lists on this site, in the owner's order.
// Sitemaps and data files are skipped. So is the "Optional" section, as the format allows.
// Returns [] when the text does not look like an llms.txt, such as a "not found" page.
export function parseLlmsTxt(text: string, domain: string, max = MAX_PAGES): KeyPage[] {
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines.find(Boolean)?.startsWith("# ")) return [];
  const pages: KeyPage[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (/^##\s+optional\b/i.test(line)) break;
    const link = line.match(/^[-*+]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (!link || !URL.canParse(link[2])) continue;
    const url = new URL(link[2]);
    const host = url.hostname.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const kind = llmsEntryKind(url.href);
    const role = link[1].replace(/\s+/g, " ").trim().slice(0, 60);
    const pageCount = pages.filter((p) => !p.file).length;
    if (kind === "page" && pageCount < max) pages.push({ role, url: url.href });
    if (kind === "file" && pages.length - pageCount < MAX_FILES) pages.push({ role, url: url.href, file: true });
    if (pageCount >= max && pages.length - pageCount >= MAX_FILES) break;
  }
  // No pages at all (only files) does not count as a usable llms.txt.
  return pages.some((p) => !p.file) ? pages : [];
}

// Only public domain names: no IP addresses, no localhost, no private or internal names.
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host);
}

// Parses "example.com/page" or a full http(s) URL. Returns null for anything that is not a public web page.
export function parsePublicUrl(input: string | null): URL | null {
  const raw = input?.trim();
  if (!raw || raw.length > 2000) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return isPublicHostname(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

// "https://www.Example.com/path" -> "example.com". Returns null when there is no usable domain.
export function normalizeDomain(input: string | null): string | null {
  const url = parsePublicUrl(input);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
}

// "docs.context.dev" -> "context.dev", so the Site view checks the whole site, not one subdomain.
// Keeps 3 labels for two-part endings like "example.co.uk". A heuristic, not a full public-suffix list.
export function siteDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const twoPartEnding = labels.length >= 3 && labels.at(-1)!.length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(labels.at(-2)!);
  return labels.slice(twoPartEnding ? -3 : -2).join(".");
}

// Runs fn over items with at most `limit` running at once (the free tier allows 2).
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
