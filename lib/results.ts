import { isChip } from "./chips";
import { siteDomain } from "./keypages";
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
// For a try chip or a page of a chip website, it also saves the full result for a week (see below).
export async function saveResult(store: Store, kind: Kind, target: string, result: Measurement | SiteResult): Promise<void> {
  await Promise.all([
    store.set(cacheKey(kind, target), result, CACHE_TTL),
    store.set(`r:${result.id}`, shareCopy({ kind, result } as Shared)),
    kind === "site" ? store.set(`latest:site:${target}`, result.id) : null,
    isChipTarget(kind, target) ? store.set(chipKey(kind, target), result, CHIP_TTL) : null,
  ]);
}

// A try chip (lib/chips.ts) and each page of its website are saved for a week, page text included, so a click is
// instant and free. The first click after a week runs a live check, which is saved for the next week.
// Visitors cannot force a fresh check of them: only time refreshes them.
export const CHIP_TTL = 7 * 24 * 60 * 60;
const chipKey = (kind: Kind, target: string) => `chip:${kind}:${target}`;

export function isChipTarget(kind: Kind, target: string): boolean {
  if (kind === "site") return isChip(target);
  return URL.canParse(target) && isChip(siteDomain(new URL(target).hostname));
}

// The chip's saved result, or null once it is a week old. The age is checked too, not only the store's expiry,
// so a result saved before chips expired never lives on.
export async function chipSaved<T extends Measurement | SiteResult>(store: Store, kind: Kind, target: string, now = Date.now()): Promise<T | null> {
  if (!isChipTarget(kind, target)) return null;
  const saved = await store.get<T>(chipKey(kind, target));
  return saved && now - Date.parse(saved.measuredAt) < CHIP_TTL * 1000 ? saved : null;
}

// The newest result for a website, for its page title and preview image: its chip result, its 24-hour cache entry,
// or its last share copy. null only when it has never been measured.
export async function latestSite(store: Store, domain: string): Promise<SiteResult | null> {
  const fresh = (await chipSaved<SiteResult>(store, "site", domain)) ?? (await cached<SiteResult>(store, "site", domain));
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
