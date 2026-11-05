// Saves Map's address list and the llms.txt of each website given, so the key-page pick can be tested offline
// on real websites (tests/keypages-real.test.ts). 1 credit per website for Map; llms.txt is downloaded directly, for free.
// Usage: npx tsx --env-file=.env scripts/record-maps.mts posthog.com stripe.com vercel.com
import { mkdirSync, writeFileSync } from "node:fs";
import ContextDev from "context.dev";
import { MAP_LIMIT } from "../lib/keypages";
import { TAGS } from "../lib/measure";
import { plainFetch } from "../lib/plain-fetch";

const key = process.env.CONTEXT_DEV_API_KEY;
console.log(key ? `CONTEXT_DEV_API_KEY set, length ${key.length}` : "CONTEXT_DEV_API_KEY missing");
const domains = process.argv.slice(2);
if (!key || !domains.length) process.exit(1);

// No retries: every retry could spend a credit.
const sdk = new ContextDev({ apiKey: key, maxRetries: 0 });
mkdirSync("tests/fixtures/local", { recursive: true });

for (const domain of domains) {
  const name = domain.replace(/\./g, "-");
  const map = await sdk.web.mapUrls({ domain, includeSubdomains: true, maxLinks: MAP_LIMIT, tags: TAGS });
  const credits = map.key_metadata?.credits_consumed;
  const saved: Partial<typeof map> = { ...map };
  delete saved.key_metadata;
  writeFileSync(`tests/fixtures/local/map-${name}.json`, JSON.stringify(saved, null, 2) + "\n");
  const llms = await plainFetch(`https://${domain}/llms.txt`);
  if (llms.status === "ok") writeFileSync(`tests/fixtures/local/llms-${name}.txt`, llms.text);
  console.log(`${domain}: ${map.urls.length} addresses (${credits ?? "?"} credit), llms.txt ${llms.status}`);
}
