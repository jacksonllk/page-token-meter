// One live Site view of context.dev (llms.txt first, then our pick).
// Saves everything it fetches to tests/fixtures/local, so dev:fixtures replays the same run: the map,
// each llms.txt check (found or not) and each key page. Spends up to 11 credits on your own key.
// Usage: npx tsx --env-file=.env scripts/record-site.mts
import { mkdirSync, writeFileSync } from "node:fs";
import ContextDev from "context.dev";
import { sitePageFixture } from "../lib/fixture-client";
import { measureSite } from "../lib/site";

const key = process.env.CONTEXT_DEV_API_KEY;
console.log(key ? `CONTEXT_DEV_API_KEY set, length ${key.length}` : "CONTEXT_DEV_API_KEY missing");
if (!key) process.exit(1);

// No retries: every retry could spend a credit.
const sdk = new ContextDev({ apiKey: key, maxRetries: 0 });
let remaining: number | undefined;
mkdirSync("tests/fixtures/local/site", { recursive: true });

const client = {
  web: {
    scrape: (async (params) => {
      const res = await sdk.web.scrape(params);
      remaining = res.key_metadata?.credits_remaining ?? remaining;
      // Keep the Markdown. Drop the large HTML and the account data.
      const saved = { ...res, html: { ...res.html, data: null } } as Partial<typeof res>;
      delete saved.key_metadata;
      const file = `tests/fixtures/local/${sitePageFixture(params.url)}.json`;
      writeFileSync(file, JSON.stringify(saved, null, 2) + "\n");
      console.log(`saved ${file}: ${res.markdown.success ? `${res.markdown.data?.length ?? 0} chars` : res.markdown.error_code}`);
      return res;
    }) as typeof sdk.web.scrape,
    mapUrls: (async (params) => {
      const res = await sdk.web.mapUrls(params);
      remaining = res.key_metadata?.credits_remaining ?? remaining;
      const saved: Partial<typeof res> = { ...res };
      delete saved.key_metadata;
      writeFileSync("tests/fixtures/local/map-context-dev.json", JSON.stringify(saved, null, 2) + "\n");
      return res;
    }) as typeof sdk.web.mapUrls,
  },
};

const site = await measureSite("context.dev", client, {
  onEvent: (e) => console.log(`${String(e.ms).padStart(6)} ms  ${e.type}${e.type === "llms" ? ` ${e.url ?? "none"}` : ""}`),
});
console.log(`pages from: ${site.source}${site.llmsTxt ? ` (${site.llmsTxt})` : ""}`);
for (const p of site.pages) console.log(`  ${p.role.slice(0, 24).padEnd(24)} ${p.url.padEnd(55)} ${p.markdown?.tokens ?? p.error}`);
console.log(`total ${site.totalMarkdownTokens}, credits used ${site.creditsUsed}, remaining ${remaining ?? "unknown"}`);
