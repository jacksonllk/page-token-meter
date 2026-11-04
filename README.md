<img src="public/page-token-meter.png" alt="Page Token Meter logo" width="72">

# Page Token Meter

**Your site's token budget.** Paste a URL. See how many tokens an AI agent needs to read your key pages.

[![Powered by context.dev](https://img.shields.io/badge/Powered%20by-context.dev-2663eb)](https://context.dev/?utm_source=page-token-meter&utm_medium=readme&utm_campaign=open-source)
[![CI](https://github.com/jacksonllk/page-token-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/jacksonllk/page-token-meter/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

![Page Token Meter measuring the key pages of context.dev](demo/screenshot.png)

## What it does

- **Whole site.** Finds up to 8 key pages: the ones your llms.txt lists, or else home, pricing, docs and API reference. Shows the tokens for each page and the total.
- **One page.** Splits a page's tokens into top menus, your content and footer. Shows how much an agent reads before it reaches your content.
- **Markdown and llms.txt.** Checks whether your site publishes a Markdown version of the page and an llms.txt.
- **Share links.** Every result has a link and a preview image for X, Slack and the like.
- **JSON API.** Set a token budget and fail your CI when a page goes over it.

## Quickstart

You need Node.js 20.9 or later and a free [context.dev](https://context.dev/?utm_source=page-token-meter&utm_medium=readme&utm_campaign=open-source) account (1,000 credits a month, no card).

```bash
git clone https://github.com/jacksonllk/page-token-meter && cd page-token-meter
cp .env.example .env   # then add your CONTEXT_DEV_API_KEY
npm install && npm run dev
```

Open http://localhost:3000.

## How we count

- Tokens are counted with OpenAI's o200k tokenizer, run locally. The count is exact for the OpenAI models that use it, such as GPT-4o, GPT-4.1 and GPT-5.
- We count the Markdown version of your page, made by context.dev. It loads each page in a real browser, so JavaScript-rendered pages count too.
- Other models count differently. We do not guess those numbers.
- Pages change. Every result shows when it was measured.

## API

Both routes return JSON. Add `maxTokens` to check a budget: `check.result` is `pass` or `fail`.

```bash
curl "http://localhost:3000/api/measure?url=docs.context.dev&maxTokens=3000"
```

```jsonc
{
  "measurement": {
    "url": "https://docs.context.dev/",
    "tokenizer": { "encoding": "o200k_base", "library": "js-tiktoken", "version": "1.0.21" },
    "markdown": { "tokens": 2712, "chars": 11272 },
    "mainContent": { "tokens": 1811, "chars": 7674 },
    "breakdown": { "before": 826, "main": 1809, "after": 77 },
    "published": { "status": "offered", "tokens": 2350, "url": "https://docs.context.dev/introduction.md" },
    "html": { "tokens": 164498, "chars": 469292 }
    // ...
  },
  "check": { "maxTokens": 3000, "tokens": 2712, "result": "pass" }
}
```

For a whole site, use `/api/site?domain=context.dev&maxTokens=50000`. The budget applies to the total of the key pages.

To fail a CI step when a page goes over budget:

```bash
curl -s "$METER_URL/api/measure?url=docs.example.com&maxTokens=3000" | jq -e '.check.result == "pass"'
```

## How it uses context.dev

| context.dev API | What we use it for |
|---|---|
| Scrape (`web.scrape`) | Each page as Markdown and HTML, and its main content only |
| Map (`web.mapUrls`) | Finding the pages of a site |

| Check | Credits |
|---|---|
| One page | 2 (full page, main content) |
| Whole site | 1 for the map, plus 1 per key page. 11 at most (8 pages and 2 files). |

A page's own Markdown file and a site's llms.txt are plain text, so the app downloads them directly for free. It asks context.dev (1 more credit each) only when a site blocks that download. Repeat checks within 24 hours come from the cache and cost nothing.

## Configuration

Copy `.env.example` to `.env`. Only the key is required.

| Variable | What it does |
|---|---|
| `CONTEXT_DEV_API_KEY` | Your context.dev API key. Required. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis for the 24-hour cache, share links and limits. Without them, these live in memory until the server restarts. |
| `VISITOR_DAILY_CREDITS` | The most credits one visitor (IP address) can spend per day. Empty: no limit. |
| `DAILY_CREDIT_CAP` | The most credits the whole site can spend per day. Empty: no limit. |
| `LIVE_CHECKS` | Set to `off` to stop all context.dev calls. Saved results are still served. |

## Deploy your own

1. Import this repo into [Vercel](https://vercel.com/new).
2. Add `CONTEXT_DEV_API_KEY`.
3. Optional: in the project's **Storage** tab, add **Upstash for Redis** and connect it. Vercel sets its variables for you.
4. If the site is public, set `VISITOR_DAILY_CREDITS` and `DAILY_CREDIT_CAP`. Every check spends your credits.

## Limitations

- Token counts are for OpenAI's o200k tokenizer only.
- Where a page's main content starts is context.dev's estimate. The menus and footer split is approximate.
- We measure what an agent would read as Markdown. We don't claim how any particular agent reads a page.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
