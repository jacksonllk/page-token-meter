import { createHash } from "node:crypto";
import { credits } from "./measure";
import type { SiteClient } from "./site";
import type { Store } from "./store";

export type Kind = "page" | "site";

const DAY = 24 * 60 * 60;

// Wraps the context.dev client to add up the credits it reports on every response.
// This counts exactly what was charged, also for the calls of a check that failed part way.
export function meterCredits<C extends { web: Partial<SiteClient["web"]> }>(client: C): { client: C; used: () => Promise<number> } {
  let used = 0;
  const pending: Promise<unknown>[] = [];
  const count = <R>(call: Promise<R>) => {
    const counted = call.then((res) => ((used += credits(res as { key_metadata?: { credits_consumed: number } })), res));
    pending.push(counted.catch(() => {}));
    return counted;
  };
  const { scrape, mapUrls } = client.web;
  const web = {
    ...(scrape && { scrape: (params: Parameters<typeof scrape>[0]) => count(scrape.call(client.web, params)) }),
    ...(mapUrls && { mapUrls: (params: Parameters<typeof mapUrls>[0]) => count(mapUrls.call(client.web, params)) }),
  };
  // Waits for calls still running, such as the main-content call when the full page failed first.
  const total = async () => {
    await Promise.all(pending);
    return used;
  };
  return { client: { ...client, web } as C, used: total };
}

// Credits per day (UTC), set on the hosted demo. Each one unset (self-hosted copies, local runs): no limit.
// DAILY_CREDIT_CAP: the whole site. VISITOR_DAILY_CREDITS: each visitor (IP address).
const setting = (name: string): number | null => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : null;
};
export const dailyCap = () => setting("DAILY_CREDIT_CAP");
export const visitorDailyCredits = () => setting("VISITOR_DAILY_CREDITS");

const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const siteKey = (now: number) => `credits:${today(now)}`;
// The IP address is stored as a one-way hash, never as itself.
const visitorKey = (ip: string, now: number) => `credits:${today(now)}:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;

export type LimitHit = "site" | "visitor" | null;

// Which limit today's spend has reached, if any. Checks already running still finish.
export async function limitReached(store: Store, ip: string, now = Date.now()): Promise<LimitHit> {
  const cap = dailyCap();
  const visitor = visitorDailyCredits();
  const [siteSpent, visitorSpent] = await Promise.all([
    cap === null ? 0 : store.get<number>(siteKey(now)),
    visitor === null ? 0 : store.get<number>(visitorKey(ip, now)),
  ]);
  if (cap !== null && (siteSpent ?? 0) >= cap) return "site";
  if (visitor !== null && (visitorSpent ?? 0) >= visitor) return "visitor";
  return null;
}

// Adds a finished check's credits to today's totals: the whole site's and this visitor's.
export async function addCredits(store: Store, ip: string, credits: number, now = Date.now()): Promise<void> {
  if (credits <= 0) return;
  await Promise.all([store.incr(siteKey(now), credits, 2 * DAY), store.incr(visitorKey(ip, now), credits, 2 * DAY)]);
}
