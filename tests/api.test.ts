import { APIError } from "context.dev";
import { describe, expect, it } from "vitest";
import { handleMeasure, normalizeUrl } from "@/lib/api";
import { exampleClient, fakeClient } from "./helpers/fake-client";

const get = (query: string) => new Request(`http://localhost/api/page${query}`);

describe("normalizeUrl", () => {
  it.each([
    ["docs.context.dev", "https://docs.context.dev/"],
    ["https://www.context.dev/pricing", "https://www.context.dev/pricing"],
    ["  http://example.org/a  ", "http://example.org/a"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "localhost",
    "ftp://example.com",
    "javascript:alert(1)",
    "not a url",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://printer.local/",
    "https://db.internal/",
    "https://user:pass@example.com/",
  ])("rejects %s", (input) => {
    expect(normalizeUrl(input)).toBeNull();
  });
});

describe("GET /api/page", () => {
  it("returns the measurement", async () => {
    const res = await handleMeasure(get("?url=docs.context.dev"), exampleClient().client);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.measurement.url).toBe("https://docs.context.dev/");
    expect(body.measurement.markdown.tokens).toBeGreaterThan(0);
    expect(body.check).toBeUndefined();
  });

  it("passes when the Markdown fits maxTokens", async () => {
    const body = await (await handleMeasure(get("?url=docs.context.dev&maxTokens=100000"), exampleClient().client)).json();
    expect(body.check).toMatchObject({ maxTokens: 100000, result: "pass" });
  });

  it("fails when the Markdown is over maxTokens", async () => {
    const body = await (await handleMeasure(get("?url=docs.context.dev&maxTokens=10"), exampleClient().client)).json();
    expect(body.check).toMatchObject({ maxTokens: 10, result: "fail" });
  });

  it.each(["", "?url=", "?url=localhost"])("rejects a bad URL: %s", async (query) => {
    const res = await handleMeasure(get(query), exampleClient().client);
    expect(res.status).toBe(400);
  });

  it.each(["0", "-5", "1.5", "abc"])("rejects maxTokens=%s", async (value) => {
    const res = await handleMeasure(get(`?url=docs.context.dev&maxTokens=${value}`), exampleClient().client);
    expect(res.status).toBe(400);
  });

  it("says so when the server has no key", async () => {
    const res = await handleMeasure(get("?url=docs.context.dev"), null);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("NO_KEY");
  });

  it("shows the demo limit message when context.dev is out of credits", async () => {
    const { client } = fakeClient({ full: new APIError(402, { code: "USAGE_EXCEEDED" }, "Usage exceeded", new Headers()) });
    const res = await handleMeasure(get("?url=docs.context.dev"), client);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("DEMO_LIMIT");
  });
});
