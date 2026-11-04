# Test fixtures

A fixture is a saved API response. Tests and `npm run dev:fixtures` read these files instead of calling the live context.dev API, so they spend no credits.

## Where they are

Saved responses hold real page text from other sites, so they are **not in this repo**. They live in `tests/fixtures/local/`, which git ignores, on your own computer.

- Tests that check real page numbers run only where that folder exists. GitHub's CI skips them and runs the rest on made-up pages (`tests/helpers/fake-client.ts`).
- `npm run dev:fixtures` needs the folder. Without it, run the app with your own context.dev key.

## Guards

- `.githooks/pre-commit` blocks any commit that adds files under `tests/fixtures/` other than this README. Turn it on once per clone: `git config core.hooksPath .githooks`.
- `tests/repo-guard.test.ts` fails if git tracks anything else here.

## Making your own

Record them with your own context.dev key: see [scripts/README.md](../../scripts/README.md). No keys and no account data are saved: `key_metadata` is removed before saving.
