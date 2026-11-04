# Contributing

Thanks for helping.

1. Fork the repo and clone your fork.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your own context.dev key. Never commit `.env`.
4. Run `npm run dev` to start the app.
5. Run `npm test`, `npm run lint` and `npm run typecheck`. Tests never call the live API and spend no credits.
6. Open a pull request with a short note on what changed and why.

Keep changes small. Open an issue first for anything big.

## Saved responses (optional)

Some tests check numbers on real pages, and `npm run dev:fixtures` runs the app offline. Both need saved context.dev responses, which are not in the repo because they hold other sites' text. To record your own with your key, see [scripts/README.md](scripts/README.md). Without them, those tests are skipped and everything else works.
