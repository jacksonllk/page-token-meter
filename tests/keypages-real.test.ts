// The key-page pick on real websites: Map's saved address list and the website's llms.txt, recorded with
// scripts/record-maps.mts into tests/fixtures/local (git-ignored). Skipped when they are missing, as in CI.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLlmsTxt, pickKeyPages } from "@/lib/keypages";

const SITES = ["context.dev", "posthog.com", "stripe.com", "vercel.com"];
const file = (kind: "map" | "llms", domain: string) => `tests/fixtures/local/${kind}-${domain.replace(/\./g, "-")}.${kind === "map" ? "json" : "txt"}`;
const saved = SITES.filter((d) => existsSync(file("map", d)));

// Without saved data (CI), one skipped test keeps the file valid: Vitest fails a file with no tests.
describe.skipIf(saved.length > 0)("key pages of real websites", () => {
  it.skip("needs Map lists recorded with scripts/record-maps.mts", () => {});
});

describe.each(saved)("key pages of %s", (domain) => {
  const urls: string[] = JSON.parse(readFileSync(file("map", domain), "utf8")).urls.map((u: { url: string }) => u.url);
  const llms = existsSync(file("llms", domain)) ? parseLlmsTxt(readFileSync(file("llms", domain), "utf8"), domain) : null;
  const picks = pickKeyPages(domain, urls, 8, llms?.pages ?? []);

  it("starts with the home page and keeps to the main site and its docs", () => {
    console.log(`${domain}\n${picks.map((p) => `  ${p.role.padEnd(14)} ${p.url}`).join("\n")}\n  files: ${llms?.files.map((f) => f.url).join(", ") || "none"}`);
    expect(picks.length).toBeGreaterThan(1);
    expect(picks.length).toBeLessThanOrEqual(8);
    expect(picks[0].role).toBe("Home");
    for (const p of picks) expect(new URL(p.url).hostname.replace(/^(www|docs)\./, "")).toBe(domain);
  });

  it("never picks forms, jobs, news, legal, status pages, sitemaps or llms.txt files", () => {
    const bad = /\/(sign-?up|log-?in|sign-?in|register|careers|jobs|blog|news|terms|privacy|legal)(\/|$)|status\.|sitemap|llms(-[a-z]+)?\.txt|\.well-known/i;
    expect([...picks, ...(llms?.files ?? [])].filter((p) => bad.test(p.url))).toEqual([]);
  });

  it("measures each page once", () => {
    const key = (u: string) => new URL(u).hostname.replace(/^www\./, "") + new URL(u).pathname.replace(/\.md$/, "").replace(/\/$/, "");
    expect(new Set(picks.map((p) => key(p.url))).size).toBe(picks.length);
  });

  it("picks the pricing page when Map or the llms.txt has one at /pricing", () => {
    const has = [...urls, ...(llms?.pages ?? [])].some((u) => /^\/pricing(\.md)?\/?$/.test(new URL(u).pathname) && new URL(u).hostname.replace(/^www\./, "") === domain);
    if (has) expect(picks.find((p) => p.role === "Pricing")?.url).toMatch(/\/pricing(\.md)?\/?$/);
  });
});
