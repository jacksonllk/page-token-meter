// Saves real context.dev responses to tests/fixtures/local/ so tests can reuse them for free.
// Spends credits on your own key: one per call (6 in total).
// Usage: node --env-file=.env scripts/record-fixtures.ts
import ContextDev from "context.dev";
import { getEncoding } from "js-tiktoken";
import { mkdirSync, writeFileSync } from "node:fs";

const key = process.env.CONTEXT_DEV_API_KEY;
console.log(key ? `CONTEXT_DEV_API_KEY set, length ${key.length}` : "CONTEXT_DEV_API_KEY missing");
if (!key) process.exit(1);

// No automatic retries: a retry could spend a credit we did not plan for.
const client = new ContextDev({ apiKey: key, maxRetries: 0 });
const enc = getEncoding("o200k_base");
const tokens = (text: string | null | undefined) => (text ? enc.encode(text, "all").length : 0);
const TAGS = ["page-token-meter", "fixtures"];
const DIR = "tests/fixtures/local";

// Our own pages: full responses, page text kept.
const PAGES = [
  { name: "docs-context-dev", url: "https://docs.context.dev/" },
  { name: "context-dev-pricing", url: "https://www.context.dev/pricing" },
];
let creditsUsed = 0;
let creditsRemaining: number | undefined;

type Response = Awaited<ReturnType<typeof client.web.scrape>>;

function save(name: string, res: Response) {
  if (res.key_metadata) {
    creditsUsed += res.key_metadata.credits_consumed;
    creditsRemaining = res.key_metadata.credits_remaining;
  }
  const rest: Partial<Response> = { ...res };
  delete rest.key_metadata;
  writeFileSync(`${DIR}/${name}.json`, JSON.stringify(rest, null, 2) + "\n");
}

function summary(res: Response) {
  return {
    markdown: { success: res.markdown.success, error_code: res.markdown.error_code, chars: res.markdown.data?.length ?? 0, tokens: tokens(res.markdown.data) },
    html: { success: res.html.success, chars: res.html.data?.length ?? 0, tokens: tokens(res.html.data) },
    cache: res.cache_metadata?.status,
  };
}

mkdirSync(DIR, { recursive: true });
const recorded: Record<string, unknown> = {};

async function call(name: string, fn: () => Promise<Response>) {
  try {
    const res = await fn();
    return res;
  } catch (e) {
    const err = e as { status?: number; error?: unknown; message?: string };
    console.log(`${name}: thrown error, status ${err.status ?? "none"}`);
    recorded[name] = { thrown: { status: err.status, error: err.error, message: err.message } };
    return null;
  }
}

for (const page of PAGES) {
  const full = await call(`${page.name}.full`, () =>
    client.web.scrape({ url: page.url, formats: { markdown: true, html: true }, sharedParams: { mainContentOnly: false }, maxAgeMs: 0, tags: TAGS }),
  );
  if (full) { save(`${page.name}.full`, full); recorded[`${page.name}.full`] = summary(full); }

  const main = await call(`${page.name}.main`, () =>
    client.web.scrape({ url: page.url, formats: { markdown: true }, sharedParams: { mainContentOnly: true }, maxAgeMs: 0, tags: TAGS }),
  );
  if (main) { save(`${page.name}.main`, main); recorded[`${page.name}.main`] = summary(main); }

  const published = await call(`${page.name}.published`, () =>
    client.web.scrape({ url: page.url, formats: { markdown: true }, markdownParams: { sourcePreference: ["markdown-direct"] }, maxAgeMs: 0, tags: TAGS }),
  );
  if (published) { save(`${page.name}.published`, published); recorded[`${page.name}.published`] = summary(published); }
}

writeFileSync(`${DIR}/recorded.json`, JSON.stringify({ recordedAt: new Date().toISOString(), counts: recorded }, null, 2) + "\n");
console.log(JSON.stringify(recorded, null, 2));
console.log(`Credits used: ${creditsUsed}. Credits remaining: ${creditsRemaining ?? "unknown"}.`);
