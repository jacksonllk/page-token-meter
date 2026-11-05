import { describe, expect, it } from "vitest";
import { pickLogo } from "@/lib/logo";
import { fetchImage, pageExists } from "@/lib/plain-fetch";

describe("pickLogo", () => {
  it("takes the largest PNG icon of at least 64 px, apple-touch-icon counting as 180", () => {
    const html = [
      '<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png"/>',
      '<link rel="icon" href="/favicon.ico"/>',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
      '<link rel="icon" type="image/svg+xml" href="/logo.svg" sizes="any"/>',
    ].join("");
    expect(pickLogo(html, "https://www.example.com/pricing")).toBe("https://www.example.com/apple-touch-icon.png");
    expect(pickLogo('<link rel="icon" sizes="192x192" href="/a-192.png"><link rel="apple-touch-icon" sizes="180x180" href="/b.png">', "https://example.com/")).toBe("https://example.com/a-192.png");
  });

  it("decodes &amp; in the icon's address", () => {
    expect(pickLogo('<link rel="apple-touch-icon" href="https://cdn.example.com/icon.png?w=180&amp;h=180">', "https://example.com/")).toBe("https://cdn.example.com/icon.png?w=180&h=180");
  });

  it("skips icons meant for dark mode", () => {
    const html = '<link rel="icon" sizes="192x192" href="/dark.png" media="(prefers-color-scheme: dark)"><link rel="icon" sizes="96x96" href="/light.png">';
    expect(pickLogo(html, "https://example.com/")).toBe("https://example.com/light.png");
  });

  it("falls back to /apple-touch-icon.png on the page's host when nothing large enough is declared", () => {
    expect(pickLogo('<link rel="icon" href="/favicon-32x32.png" sizes="32x32">', "https://docs.example.com/a/b")).toBe("https://docs.example.com/apple-touch-icon.png");
    expect(pickLogo("", "https://example.com/")).toBe("https://example.com/apple-touch-icon.png");
  });
});

describe("pageExists safety", () => {
  it.each(["http://127.0.0.1/pricing", "http://169.254.169.254/pricing", "http://localhost/pricing", "not a url"])("never checks %s", async (url) => {
    expect(await pageExists(url)).toBe(false);
  });
});

describe("fetchImage safety", () => {
  it.each(["http://127.0.0.1/logo.png", "http://169.254.169.254/latest", "http://localhost/logo.png", "not a url"])("never fetches %s", async (url) => {
    expect(await fetchImage(url)).toBeNull();
  });
});
