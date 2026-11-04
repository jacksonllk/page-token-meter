import type { Measurement } from "./measure";

// Share of the full Markdown that is navigation and footer, from 0 to 1. null when unknown.
// Kept apart from measure.ts so the browser can use it without the server-only code.
export function navFooterShare(m: Pick<Measurement, "markdown" | "mainContent">): number | null {
  if (!m.mainContent || m.markdown.tokens === 0) return null;
  return Math.min(1, Math.max(0, 1 - m.mainContent.tokens / m.markdown.tokens));
}
