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
export async function saveResult(store: Store, kind: Kind, target: string, result: Measurement | SiteResult): Promise<void> {
  await Promise.all([
    store.set(cacheKey(kind, target), result, CACHE_TTL),
    store.set(`r:${result.id}`, shareCopy({ kind, result } as Shared)),
  ]);
}

export function sharedResult(store: Store, id: string): Promise<Shared | null> {
  // Ids are UUIDs. Anything else is not a key we wrote.
  if (!/^[0-9a-f-]{36}$/.test(id)) return Promise.resolve(null);
  return store.get<Shared>(`r:${id}`);
}
