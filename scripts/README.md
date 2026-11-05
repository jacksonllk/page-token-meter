# Scripts

Optional tools for contributors. You don't need any of them to run the app or the tests.

They record real context.dev responses into `tests/fixtures/local/`. With those saved responses you can:

- run the app offline with `npm run dev:fixtures` (no key, no credits), and
- run the extra tests marked `local`, which check numbers on real pages. CI skips them.

The saved responses hold other sites' page text, so they are never committed. Git ignores `tests/fixtures/local/`. See [tests/fixtures/README.md](../tests/fixtures/README.md).

## The scripts

Each one that calls context.dev spends credits on the key in your `.env`.

| Script | What it saves | Credits |
|---|---|---|
| `record-fixtures.ts` | docs.context.dev and context.dev/pricing: full page, main content and published Markdown. Also their token counts, in `recorded.json`. | 6 |
| `record-site.mts` | One Whole site check of context.dev: the map, the llms.txt lookups and each key page. | Up to 13 |
| `record-maps.mts` | Saves Map's address list and the llms.txt of each website you name. `tests/keypages-real.test.ts` uses them. Usage: `npx tsx --env-file=.env scripts/record-maps.mts posthog.com stripe.com`. | 1 per website |
| `record-missing.mts` | Whatever offline mode still lacks when you open a page from the Whole site result. Lists it first, for free. Records it with `--record`. | 1 per missing response |
| `tiktoken_check.py` | The same pages counted with OpenAI's own Python tokenizer, in `python-counts.json`. A test checks that our JavaScript tokenizer gives the same numbers. | 0 |

## Running them

Record in this order:

```bash
node --env-file=.env scripts/record-fixtures.ts
npx tsx --env-file=.env scripts/record-site.mts
npx tsx --env-file=.env scripts/record-missing.mts            # list what is missing (free)
npx tsx --env-file=.env scripts/record-missing.mts --record   # record it
```

The Python check needs a one-time setup:

```bash
python3 -m venv .venv && .venv/bin/pip install tiktoken
.venv/bin/python scripts/tiktoken_check.py
```
