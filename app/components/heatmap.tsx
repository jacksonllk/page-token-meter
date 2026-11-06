"use client";

import { HEAT_CELLS, tokensPerSquare } from "@/lib/heat";

// Grey: other text. Blue: main content. A green dot: the square's tokens are mostly link URLs.
const OTHER = "bg-track";
const MAIN = "bg-accent";
// One light green for every dot: it stands out on the blue and the grey, in light and dark mode.
const DOT = "absolute inset-[30%] rounded-full bg-dot";

// The token map (lib/heat.ts): the page's tokens in reading order, in squares of equal tokens, filled left to right
// and top to bottom. Reading order, not screen layout: a sidebar that comes first in the code is drawn at the top.
// heat null: still measuring (skeleton squares), or "empty" when the page could not be split.
// links: 1 for each square that is mostly link addresses. Missing on results saved before 6 Nov.
// active and onSelect: the square clicked, so the text panel below can show that part of the page.
// Clicking the selected square again clears it.
export function Heatmap({
  heat,
  links = null,
  empty = false,
  active = null,
  onSelect,
}: {
  heat: number[] | null;
  links?: number[] | null;
  empty?: boolean;
  active?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  return (
    <div
      role="img"
      aria-label={heat ? `Token map of the page in reading order. Blue squares are main content. Grey squares are other text.${links ? " Squares with a green dot are mostly URL links." : ""}` : "Token map of the page, loading."}
      className={`relative grid w-[132px] shrink-0 grid-cols-12 gap-[2px] rounded-xl border border-line bg-panel p-2 sm:w-[168px] sm:gap-[3px] sm:p-2.5 ${!heat && !empty ? "breathe" : ""}`}
    >
      {/* One animation for the whole grid, not one per square: 192 separate animations made scrolling stutter.
          While loading, the grid breathes. Once measured, a cover slides away top to bottom, in reading order. */}
      {heat && <span aria-hidden className="heat-reveal pointer-events-none absolute inset-0 z-10 rounded-[11px] bg-panel motion-reduce:hidden" />}
      {Array.from({ length: HEAT_CELLS }, (_, i) => {
        if (!heat) return <span key={i} className={`aspect-square rounded-[2px] ${empty ? "fade bg-track/60" : "bg-track"}`} />;
        const main = (heat[i] ?? 0) > 0;
        return (
          <span
            key={i}
            onClick={onSelect && (() => onSelect(active === i ? null : i))}
            className={`relative aspect-square rounded-[2px] ${main ? MAIN : OTHER} ${onSelect ? "cursor-pointer hover:ring-1 hover:ring-fg/30 hover:ring-offset-1 hover:ring-offset-panel" : ""} ${active === i ? "ring-2 ring-fg/70 ring-offset-1 ring-offset-panel hover:ring-2 hover:ring-fg/70" : ""}`}
          >
            {links?.[i] ? <span className={DOT} /> : null}
          </span>
        );
      })}
    </div>
  );
}

// The key under the token map, and what one square holds. tokens: the page's tokens, null while measuring.
// links: whether the map shows link URLs: while measuring, and on results saved from 6 Nov.
export function HeatLegend({ tokens, links = false, hint }: { tokens: number | null; links?: boolean; hint?: string }) {
  return (
    <div className="space-y-1 text-[11px] text-faint">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[2px] ${MAIN}`} />
          Main content
        </span>
        {links && (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-dot" />
            Links
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[2px] ${OTHER}`} />
          Other text
        </span>
      </p>
      <p>
        {tokens !== null && `${tokensPerSquare(tokens)} `}This shows where the main content sits in the page&rsquo;s reading order.{hint && ` ${hint}`}
      </p>
    </div>
  );
}
