import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countTokens, TOKENIZER } from "@/lib/tokens";
import { HAS_SAVED_PAGES } from "./helpers/fake-client";

describe("countTokens", () => {
  it("reports the installed js-tiktoken version", () => {
    const pkg = JSON.parse(readFileSync("node_modules/js-tiktoken/package.json", "utf8"));
    expect(TOKENIZER.version).toBe(pkg.version);
  });

  it("returns 0 for empty text", () => {
    expect(countTokens("")).toBe(0);
  });

  it("counts special-token strings as plain text", () => {
    expect(countTokens("<|endoftext|>")).toBeGreaterThan(1);
  });
});

// python-counts.json comes from OpenAI's Python tiktoken (scripts/tiktoken_check.py). Local only: CI skips this.
describe.skipIf(!HAS_SAVED_PAGES)("js-tiktoken agrees with Python tiktoken", () => {
  const python: { counts: Record<string, number> } = HAS_SAVED_PAGES
    ? JSON.parse(readFileSync("tests/fixtures/local/python-counts.json", "utf8"))
    : { counts: {} };

  it.each(Object.entries(python.counts))("%s", (key, expected) => {
    const [page, call, output] = key.split(".");
    const res = JSON.parse(readFileSync(`tests/fixtures/local/${page}.${call}.json`, "utf8"));
    expect(countTokens(res[output].data ?? "")).toBe(expected);
  });
});
