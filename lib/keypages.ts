// Picks a site's key pages: the pages its llms.txt lists, or our pick by address.

import { llmsEntryKind } from "./files";

export const MAX_PAGES = 8;
// MAX_KEY_PAGES: how many pages a Whole website check measures. 8 unless set. A self-hosted copy can raise it: 1 credit per page.
export function maxKeyPages(): number {
  const n = Number(process.env.MAX_KEY_PAGES);
  return Number.isInteger(n) && n > 0 ? n : MAX_PAGES;
}
// The most page addresses context.dev's Map call returns (context-dev-notes.md, observed). Key pages are picked from these.
export const MAP_LIMIT = 500;
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

// A page we could measure: from an llms.txt (with its link text and section heading) or from Map (address only).
// order: the owner's order in the llms.txt. For Map, the shallowest address comes first.
interface Candidate {
  url: URL;
  title?: string;
  section?: string;
  order: number;
}

const path = (c: Candidate) => c.url.pathname.toLowerCase();
const titled = (c: Candidate, re: RegExp) => re.test(c.title ?? "");

// Pages an agent does not need to understand a product or business: forms, jobs, news, legal, status, indexes.
// Docs subdomains keep paths like /account/credits: there they are documentation.
function skipped(c: Candidate): boolean {
  const first = path(c).split("/").filter(Boolean)[0] ?? "";
  if (/^(status|app|dashboard|login|auth|accounts?)\./i.test(c.url.hostname)) return true;
  if (/\/\.well-known\//.test(path(c)) || /sitemap/.test(path(c))) return true;
  if (!onDocs(c.url) && /^(sign-?up|register|log-?in|sign-?in|account|careers|jobs|blog|news|press|status|legal|terms|privacy|cookies?)$/.test(first)) return true;
  return titled(c, /^(sign ?up|log ?in|sign ?in|create (an |your )?account|careers|jobs|blog|terms|privacy|sitemap)\b/i);
}

// Key pages in the order we pick them: what site owners put first in their llms.txt files, and what AI agents read
// to understand a product or a business (research: page-token-meter-notes/key-pages-research.md, 5 Nov 2026).
// One list for every kind of website. A role the website does not have is skipped, so a law firm's service pages,
// About and Contact fill the places a developer tool gives to its docs and API reference.
// label: the row name for a page found by Map. A page from an llms.txt keeps its own link text.
const ROLES: { label: string; max: number; test: (c: Candidate, domain: string) => boolean }[] = [
  { label: "home", max: 1, test: (c, domain) => isRoot(c.url) && (c.url.hostname === domain || c.url.hostname === `www.${domain}`) },
  {
    label: "product",
    max: 2,
    test: (c) =>
      (!onDocs(c.url) && /^\/(products?|platform|features|services?|solutions)(\/[^/]+)?\/?$/.test(path(c))) ||
      /\b(products?|services|features|solutions)\b/i.test(c.section ?? ""),
  },
  {
    label: "docs start",
    max: 1,
    test: (c) =>
      (onDocs(c.url) && isRoot(c.url)) ||
      /^\/docs\/?$/.test(path(c)) ||
      /^(\/docs)?\/(introduction|overview|quickstart|quick-start|getting-started|get-started)\/?$/.test(path(c)) ||
      titled(c, /^(documentation|docs|quickstart|quick start|getting started|get started)$/i),
  },
  { label: "pricing", max: 1, test: (c) => /^\/(pricing|plans)\/?$/.test(path(c)) || titled(c, /^(pricing|plans)\b/i) },
  {
    label: "API reference",
    max: 1,
    test: (c) => /^(\/docs)?\/(api-reference|api|reference)(\/|$)/.test(path(c)) || titled(c, /^api reference\b/i) || /\bapi (reference|endpoints)\b/i.test(c.section ?? ""),
  },
  {
    label: "agent setup",
    max: 1,
    test: (c) => /\/(mcp|skills?|agents?)\/?$/.test(path(c)) || /\/auth\.md$/.test(path(c)) || titled(c, /\b(mcp|agents?|skills?)\b/i) || /\bagents?\b/i.test(c.section ?? ""),
  },
  { label: "integrations", max: 1, test: (c) => /^(\/docs)?\/(integrations|sdks?|libraries)\/?$/.test(path(c)) || titled(c, /^(integrations|sdks?|libraries)\b/i) },
  { label: "about", max: 1, test: (c) => /^\/(about|about-us|company|team)\/?$/.test(path(c)) || titled(c, /^about\b/i) },
  { label: "FAQ", max: 1, test: (c) => /^\/(faqs?|help)\/?$/.test(path(c)) || titled(c, /^(faqs?|frequently asked|help)\b/i) },
  { label: "contact", max: 1, test: (c) => /^\/(contact|contact-us|locations?)\/?$/.test(path(c)) || titled(c, /^contact\b/i) },
  { label: "changelog", max: 1, test: (c) => /^(\/docs)?\/(changelog|releases|whats-new)\/?$/.test(path(c)) || titled(c, /^(changelog|release notes)\b/i) },
  { label: "customers", max: 1, test: (c) => /^\/(customers|case-studies|stories)\/?$/.test(path(c)) || titled(c, /^(customers|case studies)\b/i) },
  { label: "security", max: 1, test: (c) => /^\/(security|trust)\/?$/.test(path(c)) || (/^trust\./i.test(c.url.hostname) && isRoot(c.url)) || titled(c, /^(security|trust)\b/i) },
];

// Picks up to max pages: each role in turn, best candidate first (owner's order, or shallowest), then,
// for an llms.txt, the rest of its pages in the owner's order.
function rank(domain: string, candidates: Candidate[], max: number, fill: boolean): KeyPage[] {
  const pool = candidates.filter((c) => !skipped(c)).sort((a, b) => a.order - b.order);
  const picked: { c: Candidate; label: string }[] = [];
  const taken = new Set<string>();
  for (const role of ROLES) {
    for (const c of pool.filter((c) => !taken.has(c.url.href) && role.test(c, domain)).slice(0, role.max)) {
      picked.push({ c, label: role.label });
      taken.add(c.url.href);
    }
  }
  if (fill) for (const c of pool) if (!taken.has(c.url.href)) picked.push({ c, label: "" });
  return picked.slice(0, max).map(({ c, label }) => ({ role: c.title ?? label, url: c.url.href }));
}

// Our pick when a site has no llms.txt: the roles above, matched by address.
// Plus one docs article when there is room, so a docs site shows a typical page.
export function pickKeyPages(domain: string, urls: string[], max = MAX_PAGES): KeyPage[] {
  const parsed = urls.flatMap((url) => (URL.canParse(url) ? [new URL(url)] : []));
  const candidates = parsed.map((url, i) => ({ url, order: depth(url) * 100_000 + i }));
  const picked = rank(domain, candidates, max, false);
  // Map does not always list the home page. Always measure it.
  if (!picked.some((p) => p.role === "home")) picked.unshift({ role: "home", url: `https://${domain}/` });
  const article = candidates
    .filter((c) => !skipped(c) && !picked.some((p) => p.url === c.url.href) && ((/\/docs\//i.test(c.url.pathname) && depth(c.url) >= 3) || (onDocs(c.url) && depth(c.url) >= 2)))
    .sort((a, b) => a.order - b.order)[0];
  if (article) picked.push({ role: "docs article", url: article.url.href });
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
// Returns up to max pages on this site, ranked by ROLES (the owner's order breaks ties and fills the rest),
// then up to MAX_FILES files in the owner's order. Sitemaps and data files are skipped,
// and so is the "Optional" section, as the format allows.
// Returns [] when the text does not look like an llms.txt, such as a "not found" page.
export function parseLlmsTxt(text: string, domain: string, max = MAX_PAGES): KeyPage[] {
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines.find(Boolean)?.startsWith("# ")) return [];
  const pages: Candidate[] = [];
  const files: KeyPage[] = [];
  const seen = new Set<string>();
  let section = "";
  for (const line of lines) {
    if (/^##\s+optional\b/i.test(line)) break;
    if (/^##\s/.test(line)) section = line.replace(/^#+\s*/, "");
    const link = line.match(/^[-*+]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (!link || !URL.canParse(link[2])) continue;
    const url = new URL(link[2]);
    const host = url.hostname.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const kind = llmsEntryKind(url.href);
    const title = link[1].replace(/\s+/g, " ").trim().slice(0, 60);
    if (kind === "page") pages.push({ url, title, section, order: pages.length });
    if (kind === "file" && files.length < MAX_FILES) files.push({ role: title, url: url.href, file: true });
  }
  const ranked = rank(domain, pages, max, true);
  // No pages at all (only files) does not count as a usable llms.txt.
  return ranked.length ? [...ranked, ...files] : [];
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

// A website from an address path such as "/Stripe.com" or "/docs.stripe.com": "stripe.com". null when it is not a public website.
export function websiteFrom(param: string): string | null {
  let text: string;
  try {
    text = decodeURIComponent(param);
  } catch {
    return null;
  }
  const host = normalizeDomain(text);
  return host && host.includes(".") ? siteDomain(host) : null;
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
