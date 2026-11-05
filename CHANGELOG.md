# Changelog

## v0.1.0 (6 Nov 2026)

First public release.

- Whole website check: finds your key pages, such as home, pricing, docs and the API reference. Shows the tokens for each page and the total.
- Measures files your llms.txt links to, like an OpenAPI spec. Their tokens are not added to the page total.
- One page check: the tokens an agent reads before, in and after the main content, with a heatmap of where the content sits.
- Checks whether a website publishes a Markdown version of the page and an llms.txt.
- Every page is loaded fresh in a real browser through context.dev. Tokens are counted with OpenAI's o200k tokenizer.
- Share links with preview images, and `/your-website.com` to measure a website from the address bar.
- JSON API with a token budget, to fail CI when a page goes over it.
- For your own copy: daily credit caps and `MAX_KEY_PAGES`.
