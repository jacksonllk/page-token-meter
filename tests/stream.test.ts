import { describe, expect, it } from "vitest";
import { handleMeasureStream, handleSiteStream } from "@/lib/api";
import { measure, type ScrapeClient } from "@/lib/measure";
import type { SiteClient } from "@/lib/site";
import { EXAMPLE_MAIN, exampleClient, fakeResponse } from "./helpers/fake-client";

async function events(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("GET /api/measure/stream", () => {
  it("sends each step, then the full result", async () => {
    const res = await handleMeasureStream(new Request("http://localhost/api/measure/stream?url=docs.context.dev"), exampleClient().client);
    expect(res.headers.get("content-type")).toContain("ndjson");
    const list = await events(res);
    expect(list.map((e) => e.type).sort()).toEqual(["done", "full", "main", "published"]);
    expect(list.at(-1).type).toBe("done");
    expect(list.at(-1).result.markdown.tokens).toBe(list.find((e) => e.type === "full").markdown.tokens);
  });

  it("ends with an error event when the page has no Markdown", async () => {
    const failed = fakeResponse(null);
    const client = { web: { scrape: async () => failed } } as unknown as ScrapeClient;
    const list = await events(await handleMeasureStream(new Request("http://localhost/api/measure/stream?url=docs.context.dev"), client));
    expect(list.at(-1)).toMatchObject({ type: "error", code: "FETCH_FAILED" });
  });

  it("rejects a bad URL before streaming", async () => {
    const res = await handleMeasureStream(new Request("http://localhost/api/measure/stream?url=localhost"), exampleClient().client);
    expect(res.status).toBe(400);
  });
});

describe("measure() credit safety", () => {
  it("skips the published check when the full page fails first", async () => {
    const calls: string[] = [];
    const client = {
      web: {
        scrape: async (params: { sharedParams?: { mainContentOnly?: boolean } }) => {
          const kind = params.sharedParams?.mainContentOnly ? "main" : "other";
          calls.push(kind);
          if (kind === "main") {
            await new Promise((r) => setTimeout(r, 50));
            return fakeResponse(EXAMPLE_MAIN);
          }
          throw new Error("page down");
        },
      },
    } as unknown as ScrapeClient;
    await expect(measure("https://docs.context.dev/", client)).rejects.toThrow("page down");
    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toHaveLength(2);
  });
});

describe("GET /api/site/stream", () => {
  it("sends the map, the llms.txt check, the picked pages, each page, then the result", async () => {
    const client = {
      web: {
        mapUrls: async () => ({ domain: "example.com", request_id: "t", success: true, urls: ["https://example.com/", "https://example.com/pricing"].map((url) => ({ url })) }),
        scrape: async () => fakeResponse("word ".repeat(20), ""),
      },
    } as unknown as SiteClient;
    const list = await events(await handleSiteStream(new Request("http://localhost/api/site/stream?domain=example.com"), client));
    const types = list.map((e) => e.type);
    expect(types.slice(0, 3)).toEqual(["map", "llms", "picked"]);
    expect(types.filter((t) => t === "page")).toHaveLength(2);
    expect(types.filter((t) => t === "page-start")).toHaveLength(2);
    expect(types.at(-1)).toBe("done");
    expect(list.find((e) => e.type === "map").urlCount).toBe(2);
  });
});
