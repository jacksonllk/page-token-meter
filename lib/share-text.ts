import { num } from "./format";
import type { Shared } from "./results";

// The address without https:// and www., as people write it.
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

// The words for a share link preview and the share image.
export function shareText(shared: Shared): { tokens: number; target: string; title: string; description: string } {
  const tokens = shared.kind === "page" ? shared.result.markdown.tokens : shared.result.totalMarkdownTokens;
  const target = shared.kind === "page" ? shortUrl(shared.result.url) : `the key pages of ${shared.result.domain}`;
  return {
    tokens,
    target,
    title: `${num(tokens)} OpenAI o200k tokens to read ${target}`,
    description: "Counted on the Markdown version of each page. Measured with Page Token Meter, powered by context.dev.",
  };
}
