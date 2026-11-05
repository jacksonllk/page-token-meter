// Picks a site's key pages: the pages its llms.txt lists, or our pick by address.

import { llmsEntryKind } from "./files";

export const MAX_PAGES = 8;
// MAX_KEY_PAGES: how many pages a Whole website check measures. 8 unless set. A self-hosted copy can raise it: 1 credit per page.
export function maxKeyPages(): number {
  const n = Number(process.env.MAX_KEY_PAGES);
  return Number.isInteger(n) && n > 0 ? n : MAX_PAGES;
}
// The most page addresses context.dev's Map call returns (observed on 4 websites, 5 Nov 2026). Key pages are picked from these.
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

// A page we could measure, from Map or from the website's llms.txt.
// listed: the llms.txt lists it, which wins a tie between two equal matches. order: its place in the list we got it from.
interface Candidate {
  url: URL;
  listed: boolean;
  order: number;
}

const path = (u: URL) => u.pathname.toLowerCase();
// The main site (with or without www) or its docs subdomain. A merch shop's /products is not the product.
const onSite = (u: URL, domain: string) => [domain, `www.${domain}`, `docs.${domain}`].includes(u.hostname.toLowerCase());
// The same page under two addresses: with or without www, a trailing slash, a .md ending or a query string.
const pageKey = (u: URL) => `${u.hostname.toLowerCase().replace(/^www\./, "")}${path(u).replace(/\.md$/, "").replace(/\/$/, "")}`;

// Pages an agent does not need to understand a product or business: forms, jobs, news, legal, status, indexes.
// Docs subdomains keep paths like /account/credits: there they are documentation.
function skipped(u: URL): boolean {
  const first = path(u).split("/").filter(Boolean)[0] ?? "";
  if (/^(status|app|dashboard|login|auth|accounts?)\./i.test(u.hostname)) return true;
  if (/\/\.well-known\//.test(path(u)) || /sitemap/.test(path(u)) || /\/llms(-[a-z]+)?\.txt$/.test(path(u))) return true;
  return !onDocs(u) && /^(sign-?up|register|log-?in|sign-?in|account|careers|jobs|blog|news|press|status|legal|terms|privacy|cookies?)$/.test(first);
}

// Key pages in the order we pick them: what site owners put first in their llms.txt files, and what AI agents read
// to understand a product or a business (from the llms.txt files of 25 websites and studies of what AI search cites, 5 Nov 2026).
// One list for every kind of website. A role the website does not have is skipped, so a law firm's service pages,
// About and Contact fill the places a developer tool gives to its docs and API reference.
// Matched by address only, on the main site or its docs subdomain: addresses mean the same on every website.
// Link text and llms.txt sections do not (5 Nov: PostHog's llms.txt filed its Slack app under products).
const ROLES: { label: string; max: number; at: (u: URL, domain: string) => boolean }[] = [
  { label: "Home", max: 1, at: (u, domain) => isRoot(u) && (u.hostname === domain || u.hostname === `www.${domain}`) },
  { label: "Product", max: 2, at: (u) => !onDocs(u) && /^\/(products?|platform|features|services?|solutions)(\/[^/]+)?\/?$/.test(path(u)) },
  {
    label: "Docs",
    max: 1,
    at: (u) => (onDocs(u) && isRoot(u)) || /^\/docs\/?$/.test(path(u)) || /^(\/docs)?\/(introduction|overview|quickstart|quick-start|getting-started|get-started)(\.md)?\/?$/.test(path(u)),
  },
  { label: "Pricing", max: 1, at: (u) => /^\/(pricing|plans)(\.md)?\/?$/.test(path(u)) },
  { label: "API reference", max: 1, at: (u) => /^(\/docs)?\/(api-reference|api|reference)(\/|$|\.md)/.test(path(u)) },
  { label: "Agent setup", max: 1, at: (u) => /\/(mcp|skills?|agents?)(\.md)?\/?$/.test(path(u)) || /\/auth\.md$/.test(path(u)) },
  { label: "Integrations", max: 1, at: (u) => /^(\/docs)?\/(integrations|sdks?|libraries)(\.md)?\/?$/.test(path(u)) },
  { label: "About", max: 1, at: (u) => /^\/(about|about-us|company|team)(\.md)?\/?$/.test(path(u)) },
  { label: "FAQ", max: 1, at: (u) => /^\/(faqs?|help)(\.md)?\/?$/.test(path(u)) },
  { label: "Contact", max: 1, at: (u) => /^\/(contact|contact-us|locations?)(\.md)?\/?$/.test(path(u)) },
  { label: "Changelog", max: 1, at: (u) => /^(\/docs)?\/(changelog|releases|whats-new)(\.md)?\/?$/.test(path(u)) },
  { label: "Customers", max: 1, at: (u) => /^\/(customers|case-studies|stories)(\.md)?\/?$/.test(path(u)) },
  { label: "Security", max: 1, at: (u) => /^\/(security|trust)(\.md)?\/?$/.test(path(u)) || (/^trust\./i.test(u.hostname) && isRoot(u)) },
];

// The usual address of each key page that has one. Map returns at most MAP_LIMIT addresses and can miss these,
// so a website check asks the website directly whether they exist (free, lib/plain-fetch.ts pageExists).
export const USUAL_ADDRESSES: [role: string, path: string][] = [
  ["Docs", "/docs"],
  ["Pricing", "/pricing"],
  ["Integrations", "/integrations"],
  ["About", "/about"],
  ["FAQ", "/faq"],
  ["Contact", "/contact"],
  ["Changelog", "/changelog"],
];

// Picks up to max key pages from Map's addresses. listed: the pages the website's llms.txt lists. They are
// candidates too (Map returns at most MAP_LIMIT addresses), and win a tie between two equally deep matches.
// For each role in turn: the shallowest matching page first. The home page is always one of them.
// When there is room, one docs article, so a docs site shows a typical page.
export function pickKeyPages(domain: string, urls: string[], max = MAX_PAGES, listed: string[] = []): KeyPage[] {
  const listedKeys = new Set(listed.flatMap((u) => (URL.canParse(u) ? [pageKey(new URL(u))] : [])));
  const seen = new Set<string>();
  const pool: Candidate[] = [];
  for (const raw of [...urls, ...listed]) {
    if (!URL.canParse(raw)) continue;
    const url = new URL(raw);
    const key = pageKey(url);
    if (seen.has(key) || skipped(url) || !onSite(url, domain)) continue;
    seen.add(key);
    pool.push({ url, listed: listedKeys.has(key), order: pool.length });
  }
  const better = (a: Candidate, b: Candidate) => depth(a.url) - depth(b.url) || Number(b.listed) - Number(a.listed) || a.order - b.order;
  const picked: KeyPage[] = [];
  for (const role of ROLES) {
    const hits = pool.filter((c) => !picked.some((p) => p.url === c.url.href) && role.at(c.url, domain)).sort(better);
    for (const c of hits.slice(0, role.max)) picked.push({ role: role.label, url: c.url.href });
  }
  // Map does not always list the home page. Always measure it.
  if (!picked.some((p) => p.role === "Home")) picked.unshift({ role: "Home", url: `https://${domain}/` });
  const article = pool
    .filter((c) => !picked.some((p) => p.url === c.url.href) && ((/\/docs\//i.test(c.url.pathname) && depth(c.url) >= 3) || (onDocs(c.url) && depth(c.url) >= 2)))
    .sort(better)[0];
  if (article) picked.push({ role: "Docs article", url: article.url.href });
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
// Returns the pages it lists on this site (addresses only: they help pickKeyPages break ties), and up to MAX_FILES
// files it links to (OpenAPI specs), measured apart. Sitemaps, data files and other llms.txt files are skipped,
// and so is the "Optional" section, as the format allows.
// null when the text does not look like an llms.txt, such as a "not found" page.
export function parseLlmsTxt(text: string, domain: string): { pages: string[]; files: KeyPage[] } | null {
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines.find(Boolean)?.startsWith("# ")) return null;
  const pages: string[] = [];
  const files: KeyPage[] = [];
  for (const line of lines) {
    if (/^##\s+optional\b/i.test(line)) break;
    const link = line.match(/^[-*+]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (!link || !URL.canParse(link[2])) continue;
    const url = new URL(link[2]);
    const host = url.hostname.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    const kind = llmsEntryKind(url.href);
    if (kind === "page") pages.push(url.href);
    if (kind === "file" && files.length < MAX_FILES && !files.some((f) => f.url === url.href)) {
      files.push({ role: link[1].replace(/\s+/g, " ").trim().slice(0, 60), url: url.href, file: true });
    }
  }
  return pages.length || files.length ? { pages, files } : null;
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
