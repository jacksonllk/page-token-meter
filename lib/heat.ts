// The token map: the page's Markdown in reading order, cut into HEAT_CELLS squares of equal tokens,
// laid out like text (left to right, top to bottom) in a HEAT_COLS × HEAT_ROWS rectangle.
// Each square is 1 when its text is mostly main content and 0 when it is mostly other text. A second list marks the
// squares whose tokens are mostly link addresses: the https://… part of [text](https://…). Older saved results
// hold levels from 0 to 5 and squares of equal characters: any level above 0 is main content.
// Safe to import in the browser. The square starts are counted on the server (lib/tokens.ts).

import type { Breakdown, Measurement, Run } from "./measure";

export const HEAT_COLS = 12;
export const HEAT_ROWS = 16;
export const HEAT_CELLS = HEAT_COLS * HEAT_ROWS;

// What one square holds, as a sentence for the key under the map.
export function tokensPerSquare(tokens: number): string {
  const n = Math.round(tokens / HEAT_CELLS);
  if (tokens < HEAT_CELLS) return "Each square is less than 1 token.";
  return `Each square is about ${n.toLocaleString("en-US")} ${n === 1 ? "token" : "tokens"}.`;
}

// Where square i starts in the text, in characters. i = HEAT_CELLS gives the end of the text.
// Results saved before 6 Nov have no square starts: their squares are equal slices of characters.
export function squareStart(m: Pick<Measurement, "squares" | "markdown">, i: number): number {
  const chars = m.markdown.chars;
  if (i >= HEAT_CELLS) return chars;
  return m.squares?.[i] ?? Math.round((i * chars) / HEAT_CELLS);
}

// The square that holds a character position.
export function squareAt(m: Pick<Measurement, "squares" | "markdown">, pos: number): number {
  let i = 0;
  while (i < HEAT_CELLS - 1 && squareStart(m, i + 1) <= pos) i++;
  return i;
}

// The squares, from the page's reading-order runs (lib/measure.ts readingOrder), so a square is main content exactly
// when the text panel shows most of its text as main content. starts: where each square starts (equalTokenStarts).
// A square with no characters of its own (a page under HEAT_CELLS tokens) takes the character it starts on.
export function heatLevels(chars: number, runs: Pick<Run, "main" | "chars">[], starts: number[]): number[] {
  const ranges: [number, number][] = [];
  let pos = 0;
  for (const run of runs) {
    if (run.main) ranges.push([pos, pos + run.chars]);
    pos += run.chars;
  }
  const mainIn = (from: number, to: number) => ranges.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);
  return starts.map((from, i) => {
    const to = i + 1 < starts.length ? starts[i + 1] : chars;
    if (to <= from) return mainIn(from, from + 1) > 0 ? 1 : 0;
    return mainIn(from, to) * 2 > to - from ? 1 : 0;
  });
}

// The squares whose tokens are mostly link addresses (1), and how many of the page's tokens are link addresses.
// tokenAt: where each token starts (lib/tokens.ts tokenStarts). A token counts when it starts inside an address.
export function linkSquares(markdown: string, tokenAt: number[]): { squares: number[]; tokens: number } {
  const ranges = [...markdown.matchAll(/\]\(([^)\s]+)/g)].map((m): [number, number] => [m.index + 2, m.index + 2 + m[1].length]);
  const inLink = tokenAt.map(() => false);
  let r = 0;
  tokenAt.forEach((at, i) => {
    while (r < ranges.length && ranges[r][1] <= at) r++;
    inLink[i] = r < ranges.length && ranges[r][0] <= at;
  });
  const n = tokenAt.length;
  const squares = Array.from({ length: HEAT_CELLS }, (_, i) => {
    const from = Math.floor((i * n) / HEAT_CELLS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * n) / HEAT_CELLS));
    const links = inLink.slice(from, Math.min(n, to)).filter(Boolean).length;
    return links * 2 > to - from ? 1 : 0;
  });
  return { squares, tokens: inLink.filter(Boolean).length };
}

// For results saved before the token map existed: the three-part split as squares, in token order.
// Coarser than a measured token map: the part beside and below the main content is drawn at the end.
export function heatFromBreakdown(b: Breakdown): number[] {
  const total = Math.max(1, b.before + b.main + b.after);
  const before = Math.round((b.before / total) * HEAT_CELLS);
  const main = Math.round((b.main / total) * HEAT_CELLS);
  return Array.from({ length: HEAT_CELLS }, (_, i) => (i >= before && i < before + main ? 1 : 0));
}
