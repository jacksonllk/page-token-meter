// Finds the saved responses that dev:fixtures still lacks for context.dev, and records them.
// It replays the Whole site view offline first, then lists every call that opening each page would need.
// --dry (default): list what is missing. Free.
// --record: call context.dev for each missing response and save it. 1 credit per call, on your own key.
// Usage: npx tsx --env-file=.env scripts/record-missing.mts [--record]
import { existsSync, writeFileSync } from "node:fs";
import ContextDev from "context.dev";
import { fileType } from "../lib/files";
import { fixtureClient, sitePageFixture } from "../lib/fixture-client";
import { TAGS } from "../lib/measure";
import { measureSite } from "../lib/site";

type Kind = "full" | "main" | "published";
const record = process.argv.includes("--record");

// The same calls as measure() in lib/measure.ts.
const params = (url: string, kind: Kind) =>
  kind === "full"
    ? { url, formats: { markdown: true, html: true }, sharedParams: { mainContentOnly: false }, tags: TAGS }
    : kind === "main"
      ? { url, formats: { markdown: true }, sharedParams: { mainContentOnly: true }, tags: TAGS }
      : { url, formats: { markdown: true }, markdownParams: { sourcePreference: ["markdown-direct" as const] }, tags: TAGS };

// Where lib/fixture-client.ts looks for each saved response.
function saved(url: string, kind: Kind): boolean {
  const site = sitePageFixture(url);
  const name = site.slice("site/".length);
  if (existsSync(`tests/fixtures/local/${name}.${kind}.json`)) return true;
  return existsSync(kind === "full" ? `tests/fixtures/local/${site}.json` : `tests/fixtures/local/${site}.${kind}.json`);
}

const site = await measureSite("context.dev", fixtureClient() as never);
const missing: { url: string; kind: Kind }[] = [];
for (const page of site.pages) {
  // A file is measured with one call. A page opened from the Site view needs all three.
  const kinds: Kind[] = fileType(page.url) ? ["full"] : ["full", "main", "published"];
  for (const kind of kinds) if (!saved(page.url, kind)) missing.push({ url: page.url, kind });
}

console.log(`Whole site replay: ${site.pages.length} pages and files, from ${site.source}.`);
for (const m of missing) console.log(`missing  ${m.kind.padEnd(9)} ${m.url}`);
console.log(`${missing.length} missing, so ${missing.length} credits to record.`);
if (!record || missing.length === 0) process.exit(0);

const key = process.env.CONTEXT_DEV_API_KEY;
console.log(key ? `CONTEXT_DEV_API_KEY set, length ${key.length}` : "CONTEXT_DEV_API_KEY missing");
if (!key) process.exit(1);
// No retries: every retry could spend a credit.
const sdk = new ContextDev({ apiKey: key, maxRetries: 0 });
let used = 0;
let remaining: number | undefined;
for (const { url, kind } of missing) {
  try {
    const res = await sdk.web.scrape(params(url, kind));
    used += res.key_metadata?.credits_consumed ?? 0;
    remaining = res.key_metadata?.credits_remaining ?? remaining;
    // Keep the Markdown. Drop the large HTML and the account data.
    const out = { ...res, html: { ...res.html, data: null } } as Partial<typeof res>;
    delete out.key_metadata;
    const file = `tests/fixtures/local/${sitePageFixture(url)}${kind === "full" ? "" : `.${kind}`}.json`;
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`saved ${file}: ${res.markdown.success ? `${res.markdown.data?.length ?? 0} chars` : res.markdown.error_code}`);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.log(`${kind} ${url}: thrown error, status ${err.status ?? "none"}: ${err.message}`);
  }
}
console.log(`credits used ${used}, remaining ${remaining ?? "unknown"}`);
