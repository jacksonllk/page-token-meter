import { describe, expect, it } from "vitest";
import { savedSiteRun } from "@/app/components/runs";
import type { SiteResult } from "@/lib/site";

const RESULT: SiteResult = {
  id: "r1",
  domain: "example.com",
  measuredAt: "2026-11-05T00:00:00.000Z",
  source: "pick",
  llmsTxt: null,
  pages: [
    { role: "home", url: "https://example.com/", markdown: { tokens: 10, chars: 40 }, html: { tokens: 20, chars: 80 }, ms: 900 },
    { role: "pricing", url: "https://example.com/pricing", markdown: { tokens: 30, chars: 120 }, html: { tokens: 50, chars: 200 }, ms: 1400 },
  ],
  totalMarkdownTokens: 40,
  heaviest: { role: "pricing", url: "https://example.com/pricing", tokens: 30 },
  creditsUsed: 3,
  steps: { map: { ms: 300, urlCount: 25 }, llms: 500, picked: 500, total: 1450 },
};

describe("savedSiteRun", () => {
  it("shows the times of the check that made the result", () => {
    const run = savedSiteRun({ domain: "example.com", startedAt: 1000 }, RESULT);
    expect(run.finishedAt).toBe(2450);
    expect(run.map).toEqual({ ms: 300, urlCount: 25 });
    expect(run.llms?.ms).toBe(500);
    expect(run.picked?.ms).toBe(500);
    expect(run.pages?.map((p) => p.ms)).toEqual([900, 1400]);
  });

  it("keeps which pages were cached copies", () => {
    const run = savedSiteRun({ domain: "example.com", startedAt: 1000 }, { ...RESULT, pages: [{ ...RESULT.pages[0], cached: true }, RESULT.pages[1]] });
    expect(run.pages?.map((p) => p.cached)).toEqual([true, undefined]);
  });

  it("shows no times for a result saved before they were kept", () => {
    const { steps, ...old } = RESULT;
    void steps;
    const run = savedSiteRun({ domain: "example.com", startedAt: 1000 }, { ...old, pages: old.pages.map(({ ms, ...p }) => (void ms, p)) });
    expect(run.finishedAt).toBe(1000);
    expect(run.map).toBeUndefined();
    expect(run.picked?.ms).toBeUndefined();
  });
});
