import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Saved page data (other sites' text) and local notes must never be in the public repo.
// They live in tests/fixtures/local, docs/, CLAUDE.md and .claude/, which git ignores.
describe("repo guard", () => {
  it("tracks no saved page data", () => {
    const tracked = execSync("git ls-files tests/fixtures", { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(tracked).toEqual(["tests/fixtures/README.md"]);
  });

  it("tracks none of the local notes", () => {
    expect(execSync("git ls-files docs CLAUDE.md .claude", { encoding: "utf8" }).trim()).toBe("");
  });

  it("ignores the local folder", () => {
    expect(execSync("git check-ignore tests/fixtures/local/x.json", { encoding: "utf8" }).trim()).toBe("tests/fixtures/local/x.json");
  });
});
