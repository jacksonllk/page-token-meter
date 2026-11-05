import { num } from "./format";
import type { Shared } from "./results";

// The address without https:// and www., as people write it.
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

// A page result's preview line: how many of its tokens are the page's main content.
function pageLine(m: Extract<Shared, { kind: "page" }>["result"]): string {
  const b = m.breakdown;
  if (!b || m.file) return "See the content AI agents get from this page and for how many tokens.";
  return `${num(b.main)} of these tokens are the page's main content.`;
}

// The words for a share link preview and the share image.
export function shareText(shared: Shared): { tokens: number; target: string; title: string; description: string } {
  const tokens = shared.kind === "page" ? shared.result.markdown.tokens : shared.result.totalMarkdownTokens;
  const target = shared.kind === "page" ? shortUrl(shared.result.url) : `the key pages of ${shared.result.domain}`;
  return {
    tokens,
    target,
    title: `${num(tokens)} tokens to read ${target}`,
    description: `${shared.kind === "site" ? "See the content AI agents get from its key pages and for how many tokens." : pageLine(shared.result)} Measured with Page Token Meter.`,
  };
}
