import type { Kind } from "./limits";
import type { Measurement } from "./measure";
import type { SiteResult } from "./site";
import type { Store } from "./store";

// A repeat check of the same page or site within 24 hours is served from here and spends 0 credits.
export const CACHE_TTL = 24 * 60 * 60;

export type Shared = { kind: "page"; result: Measurement } | { kind: "site"; result: SiteResult };

const cacheKey = (kind: Kind, target: string) => `cache:${kind}:${target}`;

export function cached<T extends Measurement | SiteResult>(store: Store, kind: Kind, target: string): Promise<T | null> {
  return store.get<T>(cacheKey(kind, target));
}

// The share copy keeps the numbers and drops the page text, so other sites' text is kept for 24 hours at most.
export function shareCopy(shared: Shared): Shared {
  if (shared.kind === "site") return shared;
  return { kind: "page", result: { ...shared.result, preview: [], readingOrder: null } };
}

// Saves a finished check: the full result in the cache for 24 hours, and the share copy at its id with no expiry.
// For a website, it also notes which share copy is the newest, so "/<website>" keeps its last result after the cache expires.
export async function saveResult(store: Store, kind: Kind, target: string, result: Measurement | SiteResult): Promise<void> {
  await Promise.all([
    store.set(cacheKey(kind, target), result, CACHE_TTL),
    store.set(`r:${result.id}`, shareCopy({ kind, result } as Shared)),
    kind === "site" ? store.set(`latest:site:${target}`, result.id) : null,
  ]);
}

// A try chip's result, kept with no expiry. "Measure again" replaces it only when the total changes by more than 10%.
const chipKey = (domain: string) => `chip:site:${domain}`;
export const CHIP_CHANGE = 0.1;

export function chipResult(store: Store, domain: string): Promise<SiteResult | null> {
  return store.get<SiteResult>(chipKey(domain));
}

// Saves a new result for a chip when there is none yet, or when its total moved by more than CHIP_CHANGE. Returns whether it saved.
export async function updateChip(store: Store, domain: string, result: SiteResult): Promise<boolean> {
  const saved = await chipResult(store, domain);
  if (saved) {
    const change = Math.abs(result.totalMarkdownTokens - saved.totalMarkdownTokens) / Math.max(1, saved.totalMarkdownTokens);
    if (change <= CHIP_CHANGE) return false;
    console.log(`chip ${domain}: total changed ${Math.round(change * 100)}% (${saved.totalMarkdownTokens} -> ${result.totalMarkdownTokens}), replaced`);
  }
  await store.set(chipKey(domain), result);
  return true;
}

// The newest result for a website, for its page title and preview image: its chip result, its 24-hour cache entry,
// or its last share copy. null only when it has never been measured.
export async function latestSite(store: Store, domain: string): Promise<SiteResult | null> {
  const fresh = (await chipResult(store, domain)) ?? (await cached<SiteResult>(store, "site", domain));
  if (fresh) return fresh;
  const id = await store.get<string>(`latest:site:${domain}`);
  const shared = id ? await sharedResult(store, id) : null;
  return shared?.kind === "site" ? shared.result : null;
}

export function sharedResult(store: Store, id: string): Promise<Shared | null> {
  // Ids are UUIDs. Anything else is not a key we wrote.
  if (!/^[0-9a-f-]{36}$/.test(id)) return Promise.resolve(null);
  return store.get<Shared>(`r:${id}`);
}
