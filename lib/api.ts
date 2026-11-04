import { APIError } from "context.dev";
import { normalizeDomain, parsePublicUrl, siteDomain } from "./keypages";
import { addCredits, limitReached, meterCredits, type Kind } from "./limits";
import { measure, MeasureError, type Measurement, type ScrapeClient } from "./measure";
import { cached, saveResult } from "./results";
import type { TextFetch } from "./plain-fetch";
import { measureSite, type SiteClient, type SiteResult } from "./site";
import type { Store } from "./store";

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Accepts "example.com/page" as well as full http(s) URLs. Returns null for anything else.
export function normalizeUrl(input: string | null): string | null {
  return parsePublicUrl(input)?.href ?? null;
}

function parseMaxTokens(input: string | null): number | null | undefined {
  if (input === null || input === "") return undefined;
  const n = Number(input);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Limit messages never say what the limits are or when they reset.
export const DAILY_LIMIT_MESSAGE = "Today's free checks are used up. You can run Page Token Meter yourself with a free context.dev account.";
export const VISITOR_LIMIT_MESSAGE = "You've used your free checks for now. Try again later, or run Page Token Meter yourself with a free context.dev account.";

// Used when live checks are switched off (LIVE_CHECKS=off) or the daily cap is reached.
export const dailyLimitResponse = () => json({ error: DAILY_LIMIT_MESSAGE, code: "DEMO_LIMIT" }, 503);

function errorBody(e: unknown): { status: number; body: { error: string; code: string } } {
  if (e instanceof MeasureError) return { status: 422, body: { error: e.message, code: e.code } };
  // context.dev is out of credits (402) or too busy (429).
  if (e instanceof APIError && (e.status === 402 || e.status === 429)) return { status: 503, body: { error: DAILY_LIMIT_MESSAGE, code: "DEMO_LIMIT" } };
  return { status: 502, body: { error: "Could not measure this page. Try again later.", code: "UPSTREAM_ERROR" } };
}

function errorResponse(e: unknown): Response {
  const { status, body } = errorBody(e);
  return json(body, status);
}

// Streams one JSON event per line (NDJSON), ending with a "done" or "error" event.
function eventStream<T>(run: (send: (event: unknown) => void) => Promise<T>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        send({ type: "done", result: await run(send) });
      } catch (e) {
        send({ type: "error", ...errorBody(e).body });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

// What the routes pass in. Tests leave it out: no cache, no limits.
export interface Guard {
  store?: Store;
  // The visitor's IP address, for the per-visitor limit.
  ip?: string;
  // LIVE_CHECKS=off: serve the cache, but make no live call.
  liveOff?: boolean;
  // Downloads llms.txt and published Markdown directly, for free. Left out in tests and fixture mode.
  fetchText?: TextFetch;
}

// The visitor's IP address. Vercel puts it first in x-forwarded-for.
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// A saved result less than 24 hours old, unless the visitor asked to measure again (?fresh=1).
async function fromCache<T extends Measurement | SiteResult>(kind: Kind, target: string, request: Request, guard: Guard): Promise<T | null> {
  if (!guard.store || new URL(request.url).searchParams.get("fresh") === "1") return null;
  try {
    return await cached<T>(guard.store, kind, target);
  } catch (e) {
    console.error("cache read failed", e);
    return null;
  }
}

// Before a live check: the kill switch, then today's credits for the whole site and for this visitor.
// Returns a refusal, or null to go ahead.
async function admit(guard: Guard): Promise<Response | null> {
  if (guard.liveOff) return dailyLimitResponse();
  if (!guard.store) return null;
  try {
    const hit = await limitReached(guard.store, guard.ip ?? "unknown");
    if (hit === "site") return dailyLimitResponse();
    if (hit === "visitor") return json({ error: VISITOR_LIMIT_MESSAGE, code: "VISITOR_LIMIT" }, 429);
    return null;
  } catch (e) {
    // Without the store we cannot count credits, so spend none.
    console.error("cap check failed", e);
    return dailyLimitResponse();
  }
}

// Runs a live check. After it, add the credits context.dev charged to today's totals, also when the check failed.
// When it worked, save the result for the cache and the share link. A store failure never hides the result.
async function live<C extends ScrapeClient | SiteClient, T extends Measurement | SiteResult>(
  kind: Kind,
  target: string,
  guard: Guard,
  client: C,
  run: (client: C) => Promise<T>,
): Promise<T> {
  const { store } = guard;
  const meter = meterCredits(client);
  const count = async () => {
    if (!store) return;
    try {
      await addCredits(store, guard.ip ?? "unknown", await meter.used());
    } catch (e) {
      console.error("counting credits failed", e);
    }
  };
  let result: T;
  try {
    result = await run(meter.client);
  } catch (e) {
    await count();
    throw e;
  }
  await count();
  if (store) {
    try {
      await saveResult(store, kind, target, result);
    } catch (e) {
      console.error("saving the result failed", e);
    }
  }
  return result;
}

const noKey = () => json({ error: "The server has no CONTEXT_DEV_API_KEY set.", code: "NO_KEY" }, 500);

// GET /api/measure/stream?url=...  Same checks as /api/measure, but sends each step as it finishes.
// A saved result is sent as the "done" event alone, with no step events: nothing was fetched.
export async function handleMeasureStream(request: Request, client: ScrapeClient | null, guard: Guard = {}): Promise<Response> {
  const url = normalizeUrl(new URL(request.url).searchParams.get("url"));
  if (!url) return json({ error: "Add a page URL, for example docs.context.dev", code: "BAD_URL" }, 400);
  const hit = await fromCache<Measurement>("page", url, request, guard);
  if (hit) return eventStream(async () => hit);
  if (!client) return noKey();
  const refused = await admit(guard);
  if (refused) return refused;
  return eventStream((send) => live("page", url, guard, client, (c) => measure(url, c, { onEvent: send, fetchText: guard.fetchText })));
}

// GET /api/site/stream?domain=...
export async function handleSiteStream(request: Request, client: SiteClient | null, guard: Guard = {}): Promise<Response> {
  const host = normalizeDomain(new URL(request.url).searchParams.get("domain"));
  const domain = host && siteDomain(host);
  if (!domain) return json({ error: "Add a domain, for example context.dev", code: "BAD_DOMAIN" }, 400);
  const hit = await fromCache<SiteResult>("site", domain, request, guard);
  if (hit) return eventStream(async () => hit);
  if (!client) return noKey();
  const refused = await admit(guard);
  if (refused) return refused;
  return eventStream((send) => live("site", domain, guard, client, (c) => measureSite(domain, c, { onEvent: send, fetchText: guard.fetchText })));
}

// GET /api/measure?url=...&maxTokens=...
export async function handleMeasure(request: Request, client: ScrapeClient | null, guard: Guard = {}): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const url = normalizeUrl(params.get("url"));
  if (!url) return json({ error: "Add a page URL, for example ?url=https://docs.context.dev/", code: "BAD_URL" }, 400);

  const maxTokens = parseMaxTokens(params.get("maxTokens"));
  if (maxTokens === null) return json({ error: "maxTokens must be a whole number above 0.", code: "BAD_MAX_TOKENS" }, 400);

  const hit = await fromCache<Measurement>("page", url, request, guard);
  if (!hit && !client) return noKey();
  const refused = hit ? null : await admit(guard);
  if (refused) return refused;

  try {
    const measurement = hit ?? (await live("page", url, guard, client!, (c) => measure(url, c, { fetchText: guard.fetchText })));
    const check =
      maxTokens === undefined
        ? undefined
        : { maxTokens, tokens: measurement.markdown.tokens, result: measurement.markdown.tokens <= maxTokens ? "pass" : "fail" };
    return json({ measurement, check });
  } catch (e) {
    return errorResponse(e);
  }
}

// GET /api/site?domain=...&maxTokens=...  maxTokens applies to the total of all key pages.
export async function handleSite(request: Request, client: SiteClient | null, guard: Guard = {}): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const host = normalizeDomain(params.get("domain"));
  const domain = host && siteDomain(host);
  if (!domain) return json({ error: "Add a domain, for example ?domain=context.dev", code: "BAD_DOMAIN" }, 400);

  const maxTokens = parseMaxTokens(params.get("maxTokens"));
  if (maxTokens === null) return json({ error: "maxTokens must be a whole number above 0.", code: "BAD_MAX_TOKENS" }, 400);

  const hit = await fromCache<SiteResult>("site", domain, request, guard);
  if (!hit && !client) return noKey();
  const refused = hit ? null : await admit(guard);
  if (refused) return refused;

  try {
    const site = hit ?? (await live("site", domain, guard, client!, (c) => measureSite(domain, c, { fetchText: guard.fetchText })));
    const check =
      maxTokens === undefined
        ? undefined
        : { maxTokens, tokens: site.totalMarkdownTokens, result: site.totalMarkdownTokens <= maxTokens ? "pass" : "fail" };
    return json({ site, check });
  } catch (e) {
    return errorResponse(e);
  }
}
