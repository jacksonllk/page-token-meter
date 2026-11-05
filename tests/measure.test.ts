import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { declaredLinks, heatLevels, measure, MeasureError, navFooterShare, PREVIEW_CHARS, readingOrder, splitPreview, splitTokens } from "@/lib/measure";
import { HEAT_CELLS, HEAT_LEVELS, heatFromBreakdown, toLevels } from "@/lib/heat";
import { fileType } from "@/lib/files";
import { countTokens } from "@/lib/tokens";
import { EXAMPLE_FULL, EXAMPLE_MAIN, fakeClient, fakeResponse, fixture, HAS_SAVED_PAGES, pageClient } from "./helpers/fake-client";

type Counts = { markdown: { tokens: number; chars: number }; html: { tokens: number; chars: number } };
// Real saved pages are local only (tests/fixtures/local). Tests marked `local` skip on GitHub's CI.
const recorded: { counts: Record<string, Counts> } = HAS_SAVED_PAGES
  ? JSON.parse(readFileSync("tests/fixtures/local/recorded.json", "utf8"))
  : { counts: {} };
const local = it.skipIf(!HAS_SAVED_PAGES);

describe.skipIf(!HAS_SAVED_PAGES).each([
  ["docs-context-dev", "https://docs.context.dev/", "offered"],
  // The pricing page declares only a site-wide /auth.md, so the Markdown context.dev returns is not this page's.
  ["context-dev-pricing", "https://www.context.dev/pricing", "unconfirmed"],
])("measure(%s)", (page, url, status) => {
  it("matches the counts stored when the responses were saved", async () => {
    const m = await measure(url, pageClient(page).client);
    const size = (c: { tokens: number; chars: number }) => ({ tokens: c.tokens, chars: c.chars });
    const full = recorded.counts[`${page}.full`];
    expect(size(m.markdown)).toEqual(size(full.markdown));
    expect(m.html).toEqual(size(full.html));
    expect(m.mainContent).toEqual(size(recorded.counts[`${page}.main`].markdown));
    const published = recorded.counts[`${page}.published`].markdown;
    if (status === "offered") expect(m.published).toMatchObject({ status, ...size(published) });
    else expect(m.published).toEqual({ status });
  });

  it("fills in the rest of the result", async () => {
    const m = await measure(url, pageClient(page).client);
    expect(m.url).toBe(url);
    expect(m.markdown.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.tokenizer).toMatchObject({ encoding: "o200k_base", library: "js-tiktoken" });
    expect(m.saved).toBe(false);
    expect(m.preview.map((p) => p.text).join("")).toBe(fixture(`${page}.full`).markdown.data!.slice(0, PREVIEW_CHARS) + "\n");
  });
});

describe("measure calls", () => {
  local("makes 3 tagged calls with the documented options", async () => {
    const { client, calls } = pageClient("docs-context-dev");
    await measure("https://docs.context.dev/", client);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.tags).toContain("page-token-meter");
    // Always a fresh load, never context.dev's saved copy.
    for (const c of calls) expect(c.maxAgeMs).toBe(0);
    expect(calls[0]).toMatchObject({ formats: { markdown: true, html: true }, sharedParams: { mainContentOnly: false } });
    expect(calls[1]).toMatchObject({ formats: { markdown: true }, sharedParams: { mainContentOnly: true } });
    expect(calls[2]).toMatchObject({ formats: { markdown: true }, markdownParams: { sourcePreference: ["markdown-direct"] } });
  });
});

describe("published Markdown", () => {
  it("is 'not_offered' when context.dev returns NO_PUBLISHED_MARKDOWN", async () => {
    const none = fakeResponse(null);
    const published = { ...none, markdown: { ...none.markdown, error_code: "NO_PUBLISHED_MARKDOWN", message: "No published Markdown." } } as typeof none;
    const { client } = fakeClient({ full: fakeResponse(EXAMPLE_FULL), main: fakeResponse(EXAMPLE_MAIN), published });
    const m = await measure("https://example.com/", client);
    expect(m.published).toEqual({ status: "not_offered" });
  });

  it("records when each step finished, so a saved result can show the times", async () => {
    const { client } = fakeClient({ full: fakeResponse(EXAMPLE_FULL), main: fakeResponse(EXAMPLE_MAIN), published: fakeResponse(EXAMPLE_MAIN) });
    const events: { type: string; ms: number }[] = [];
    const m = await measure("https://example.com/", client, { onEvent: (e) => events.push(e) });
    expect(m.steps).toEqual({ ...Object.fromEntries(events.map((e) => [e.type, e.ms])), total: expect.any(Number) });
    expect(Object.keys(m.steps!).sort()).toEqual(["full", "main", "published", "total"]);
    for (const e of events) expect(m.steps!.total).toBeGreaterThanOrEqual(e.ms);
  });

  it("records which steps context.dev answered from a copy it had already made", async () => {
    const hit = { ...fakeResponse(EXAMPLE_FULL), cache_metadata: { status: "hit", age_ms: 60_000 } } as ReturnType<typeof fakeResponse>;
    const { client } = fakeClient({ full: hit, main: fakeResponse(EXAMPLE_MAIN), published: fakeResponse(EXAMPLE_MAIN) });
    const events: { type: string; cached?: boolean }[] = [];
    const m = await measure("https://example.com/", client, { onEvent: (e) => events.push(e) });
    expect(events.map((e) => [e.type, e.cached])).toEqual(expect.arrayContaining([["full", true], ["main", false], ["published", false]]));
    expect(m.steps?.cached).toEqual(["full"]);
  });

  it("is 'offered' when the site publishes Markdown", async () => {
    const { client } = fakeClient({ full: fakeResponse(EXAMPLE_FULL), main: fakeResponse(EXAMPLE_MAIN), published: fakeResponse(EXAMPLE_MAIN) });
    const m = await measure("https://example.com/", client);
    expect(m.published).toMatchObject({ status: "offered", chars: EXAMPLE_MAIN.length });
  });

  local("is 'unknown' when the check itself fails", async () => {
    const { client } = fakeClient({
      full: fixture("docs-context-dev.full"),
      main: fixture("docs-context-dev.main"),
      published: new Error("network"),
    });
    const m = await measure("https://docs.context.dev/", client);
    expect(m.published).toEqual({ status: "unknown" });
  });
});

describe("splitPreview", () => {
  local("finds where main content starts on the saved docs page", async () => {
    const m = await measure("https://docs.context.dev/", pageClient("docs-context-dev").client);
    expect(m.contentStartChar).toBe(3281);
    expect(m.preview[0].main).toBe(false);
    expect(m.preview.some((s) => s.main)).toBe(true);
  });

  it("marks lines before the first long main-content line as navigation", () => {
    const full = "Home | Docs | Pricing\nSkip to content\n# Getting started with the API\nBody text that is long enough.\nFooter links";
    const main = "# Getting started with the API\nBody text that is long enough.";
    const { contentStartChar, preview } = splitPreview(full, main);
    expect(contentStartChar).toBe(full.indexOf("# Getting"));
    expect(preview.map((s) => s.main)).toEqual([false, true, false]);
  });

  it("skips a site-wide banner that the main-content version also keeps", () => {
    const full = "[Read our big launch announcement today](/blog)\n[Home](/) [Docs](/docs)\n# Getting started with the API\nBody text that is long enough.";
    const main = "[Read our big launch announcement today](/blog)\n# Getting started with the API\nBody text that is long enough.";
    expect(splitPreview(full, main).contentStartChar).toBe(full.indexOf("# Getting"));
  });

  it("does not split when main content is unknown", () => {
    expect(splitPreview("some text", null)).toEqual({ contentStartChar: null, preview: [{ text: "some text", main: true }] });
  });
});

describe("readingOrder", () => {
  it("splits the page into runs in reading order, with plain first lines", () => {
    const full = "[Home](/) | [Docs](/docs)\nSkip to content\n# Getting started with the API\nBody text that is long enough.\nFooter links";
    const main = "# Getting started with the API\nBody text that is long enough.";
    const runs = readingOrder(full, main, full.indexOf("# Getting"));
    expect(runs.map((r) => r.main)).toEqual([false, true, false]);
    expect(runs.map((r) => r.text)).toEqual(["Home | Docs", "Getting started with the API", "Footer links"]);
    // Runs line up with the preview text: every line plus its line break.
    expect(runs.reduce((n, r) => n + r.chars, 0)).toBe(full.length + 1);
  });

  local("covers the whole saved page and roughly adds up to its token count", async () => {
    const m = await measure("https://docs.context.dev/", pageClient("docs-context-dev").client);
    const runs = m.readingOrder!;
    expect(runs[0].main).toBe(false);
    expect(runs.some((r) => r.main)).toBe(true);
    const sum = runs.reduce((n, r) => n + r.tokens, 0);
    expect(Math.abs(sum - m.markdown.tokens) / m.markdown.tokens).toBeLessThan(0.05);
  });
});

describe("files", () => {
  it("knows a file from a web page by its address", () => {
    expect(fileType("https://example.com/openapi.json")).toBe("JSON");
    expect(fileType("https://example.com/sitemap.md")).toBe("Markdown");
    expect(fileType("https://example.com/pricing")).toBeNull();
    expect(fileType("https://example.com/v1.2/docs")).toBeNull();
  });

  it("measures a file with one call and counts all of it as content", async () => {
    const { client, calls } = fakeClient({ full: fakeResponse('{ "openapi": "3.1.0", "info": { "title": "Example API" } }') });
    const m = await measure("https://example.com/openapi.json", client);
    expect(calls).toHaveLength(1);
    expect(m.file).toBe("JSON");
    expect(m.published.status).toBe("skipped");
    expect(m.breakdown).toEqual({ before: 0, main: m.markdown.tokens, after: 0 });
    expect(m.readingOrder).toHaveLength(1);
  });
});

describe("errors", () => {
  it("throws MeasureError when the full page has no Markdown", async () => {
    const { client } = fakeClient({ full: fakeResponse(null), main: fakeResponse("main"), published: fakeResponse("main") });
    await expect(measure("https://example.com/", client)).rejects.toBeInstanceOf(MeasureError);
  });

  it("keeps the result when the main-content call fails", async () => {
    const { client } = fakeClient({ full: fakeResponse("# A made-up page\nWith some text."), main: new Error("timeout"), published: fakeResponse(null) });
    const m = await measure("https://example.com/", client);
    expect(m.mainContent).toBeNull();
    expect(navFooterShare(m)).toBeNull();
  });
});

describe("navFooterShare", () => {
  it("is 1 minus main tokens over full tokens", () => {
    expect(navFooterShare({ markdown: { tokens: 1000, chars: 0, textHash: "" }, mainContent: { tokens: 750, chars: 0 } })).toBeCloseTo(0.25);
  });

  it("stays between 0 and 1", () => {
    expect(navFooterShare({ markdown: { tokens: 100, chars: 0, textHash: "" }, mainContent: { tokens: 120, chars: 0 } })).toBe(0);
  });
});

describe("declaredLinks", () => {
  local("finds the page's own Markdown file", () => {
    expect(declaredLinks(fixture("docs-context-dev.full"))).toEqual({ markdown: "https://docs.context.dev/introduction.md", llmsTxt: null, otherMarkdown: null });
  });

  local("finds an llms.txt, and ignores Markdown files for other pages", () => {
    expect(declaredLinks(fixture("context-dev-pricing.full"))).toEqual({ markdown: null, llmsTxt: "https://www.context.dev/llms.txt", otherMarkdown: "https://www.context.dev/auth.md" });
  });

  local("links the Markdown version in the result when the site publishes one", async () => {
    const m = await measure("https://docs.context.dev/", pageClient("docs-context-dev").client);
    expect(m.published.url).toBe("https://docs.context.dev/introduction.md");
  });
});

describe("heatLevels", () => {
  // 40 lines of menu, then 40 lines of content, then 20 lines of footer, each line the same length.
  const menu = Array.from({ length: 40 }, (_, i) => `[Menu link ${String(i).padStart(2, "0")}](https://example.com/m${i})`);
  const content = Array.from({ length: 40 }, (_, i) => `Paragraph ${String(i).padStart(2, "0")} of the page's own text, with no links in it.`);
  const footer = Array.from({ length: 20 }, (_, i) => `[Footer link ${String(i).padStart(2, "0")}](https://example.com/f${i})`);
  const full = [...menu, ...content, ...footer].join("\n");
  const main = content.join("\n");
  const start = full.indexOf(content[0]);

  it("gives one level per block, from 0 to HEAT_LEVELS", () => {
    const heat = heatLevels(full, main, start);
    expect(heat).toHaveLength(HEAT_CELLS);
    expect(heat.every((l) => Number.isInteger(l) && l >= 0 && l <= HEAT_LEVELS)).toBe(true);
  });

  it("puts the main content where it is in the page, and nothing before or after it", () => {
    const heat = heatLevels(full, main, start);
    const first = heat.findIndex((l) => l > 0);
    const last = heat.length - 1 - [...heat].reverse().findIndex((l) => l > 0);
    // The content starts at the character where it starts in the page, and ends where it ends.
    expect(first).toBe(Math.floor((start * HEAT_CELLS) / full.length));
    const end = start + main.length;
    expect(last).toBe(Math.floor((end * HEAT_CELLS) / full.length));
    expect(heat.slice(first + 1, last).every((l) => l > 0)).toBe(true);
  });

  it("does not count a line before the content starts, even if the main content repeats it", () => {
    const repeated = `${content[0]}\n${full}`;
    const heat = heatLevels(repeated, main, repeated.indexOf(content[0], 1));
    expect(heat[0]).toBe(0);
  });

  it("shows a page with no main content as all zeros", () => {
    expect(heatLevels(menu.join("\n"), "", 0).every((l) => l === 0)).toBe(true);
  });
});

describe("toLevels", () => {
  it("keeps empty slices at 0, gives any content at least 1, and caps the densest at HEAT_LEVELS", () => {
    // 20 typical slices and one outlier: the outlier must not wash out the rest.
    const levels = toLevels([0, 1, ...Array(20).fill(10), 50]);
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBe(1);
    expect(levels[2]).toBe(HEAT_LEVELS);
    expect(levels.at(-1)).toBe(HEAT_LEVELS);
  });
});

describe("heatFromBreakdown", () => {
  it("draws the three parts in order, for results saved before the heatmap", () => {
    const heat = heatFromBreakdown({ before: 30, main: 60, after: 10 });
    expect(heat).toHaveLength(HEAT_CELLS);
    expect(heat.findIndex((l) => l > 0)).toBe(Math.round(0.3 * HEAT_CELLS));
    expect(heat.filter((l) => l > 0)).toHaveLength(Math.round(0.6 * HEAT_CELLS));
  });
});

describe("splitTokens", () => {
  local("splits the saved page into parts that add up to its token count", async () => {
    const m = await measure("https://docs.context.dev/", pageClient("docs-context-dev").client);
    const b = m.breakdown!;
    expect(b.before + b.main + b.after).toBe(m.markdown.tokens);
    expect(b.before).toBeGreaterThan(0);
    expect(b.main).toBeGreaterThan(b.after);
  });

  it("puts lines before the content in 'before' and non-content lines after it in 'after'", () => {
    const full = "Home | Docs | Pricing\n# Getting started with the API\nBody text that is long enough.\nFooter links and copyright";
    const main = "# Getting started with the API\nBody text that is long enough.";
    const start = full.indexOf("# Getting");
    const total = countTokens(full);
    const b = splitTokens(full, main, start, total);
    expect(b.before).toBe(countTokens(full.slice(0, start)));
    expect(b.after).toBe(countTokens("Footer links and copyright\n"));
    expect(b.before + b.main + b.after).toBe(total);
  });
});
