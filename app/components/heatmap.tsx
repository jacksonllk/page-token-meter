"use client";

import { HEAT_CELLS, HEAT_LEVELS } from "@/lib/heat";

// One shade per level, from no main content to the densest. Steps, not a smooth gradient: the pixel look.
const SHADES = ["bg-track", "bg-accent/20", "bg-accent/35", "bg-accent/55", "bg-accent/80", "bg-accent"];

// The page as a heatmap (lib/heat.ts): its text in reading order, filled left to right and top to bottom.
// Reading order, not screen layout: a sidebar that comes first in the code is drawn at the top. Darker means more main content.
// heat null: still measuring (skeleton blocks), or "empty" when the page could not be split.
// active and onPoint: pointing at a block, so the text panel below can show that part of the page.
export function Heatmap({
  heat,
  empty = false,
  active = null,
  onPoint,
}: {
  heat: number[] | null;
  empty?: boolean;
  active?: number | null;
  onPoint?: (i: number | null) => void;
}) {
  return (
    <div
      role="img"
      aria-label={heat ? "Heatmap of the page: darker blocks hold more main content." : "Heatmap of the page, loading."}
      onMouseLeave={() => onPoint?.(null)}
      className="grid w-[132px] shrink-0 grid-cols-12 gap-[2px] rounded-xl border border-line bg-panel p-2 sm:w-[168px] sm:gap-[3px] sm:p-2.5"
    >
      {Array.from({ length: HEAT_CELLS }, (_, i) => {
        if (!heat) return <span key={i} className={`aspect-square rounded-[2px] ${empty ? "fade bg-track/60" : "skeleton"}`} />;
        const level = Math.max(0, Math.min(HEAT_LEVELS, heat[i] ?? 0));
        return (
          <span
            key={i}
            onMouseEnter={onPoint && (() => onPoint(i))}
            onClick={onPoint && (() => onPoint(i))}
            className={`cell-in aspect-square rounded-[2px] ${SHADES[level]} ${active === i ? "ring-2 ring-fg/70 ring-offset-1 ring-offset-panel" : ""}`}
            style={{ animationDelay: `${i * 3}ms` }}
          />
        );
      })}
    </div>
  );
}

// The key under the heatmap: the six shades from less to more content.
export function HeatLegend() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-faint">
      Less content
      {SHADES.map((s) => (
        <span key={s} className={`size-2.5 rounded-[2px] ${s}`} />
      ))}
      More content
    </p>
  );
}
