import { describe, expect, it } from "vitest";
import type { Measurement } from "@/lib/measure";
import { shareText } from "@/lib/share-text";

const page = (before: number, file: string | null = null) =>
  ({ url: "https://docs.example.com/", file, markdown: { tokens: 1000 }, breakdown: { before, main: 1000 - before, after: 0 } }) as unknown as Measurement;

describe("shareText", () => {
  it("says how many of a page's tokens are its main content", () => {
    expect(shareText({ kind: "page", result: page(300) }).description).toBe("700 of these tokens are the page's main content. Measured with Page Token Meter.");
  });

  it("does not talk about main content for a file", () => {
    expect(shareText({ kind: "page", result: page(0, "JSON") }).description).toMatch(/^See the content AI agents get from this page/);
  });
});
