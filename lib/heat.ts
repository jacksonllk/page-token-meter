// The page heatmap: the page's Markdown in reading order, cut into HEAT_CELLS equal slices of characters,
// laid out like text (left to right, top to bottom) in a HEAT_COLS × HEAT_ROWS rectangle.
// Each slice has a level from 0 to HEAT_LEVELS: how many main-content tokens it holds. 0: none.
// Safe to import in the browser. The levels themselves are counted on the server (lib/measure.ts).

import type { Breakdown } from "./measure";

export const HEAT_COLS = 12;
export const HEAT_ROWS = 16;
export const HEAT_CELLS = HEAT_COLS * HEAT_ROWS;
export const HEAT_LEVELS = 5;

// Turns main-content tokens per slice into levels. The densest slices (90th percentile) set the top level,
// so one unusually dense slice does not wash out the rest. A slice with any main content is at least level 1.
export function toLevels(tokens: number[]): number[] {
  const nonZero = tokens.filter((t) => t > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return tokens.map(() => 0);
  const top = nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.9))];
  return tokens.map((t) => (t === 0 ? 0 : Math.max(1, Math.min(HEAT_LEVELS, Math.round((t / top) * HEAT_LEVELS)))));
}

// For results saved before the heatmap existed: the three-part split as blocks, in token order.
// Coarser than a measured heatmap: the part beside and below the main content is drawn at the end.
export function heatFromBreakdown(b: Breakdown): number[] {
  const total = Math.max(1, b.before + b.main + b.after);
  const before = Math.round((b.before / total) * HEAT_CELLS);
  const main = Math.round((b.main / total) * HEAT_CELLS);
  return Array.from({ length: HEAT_CELLS }, (_, i) => (i >= before && i < before + main ? HEAT_LEVELS - 1 : 0));
}
