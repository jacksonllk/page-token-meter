"use client";

import { useEffect, useRef, useState } from "react";
import type { Measurement, Run } from "@/lib/measure";
import { num } from "@/lib/format";

// The map always has the same number of squares, so its size never changes.
const CELLS = 200;
const PLACEHOLDER_WIDTHS = ["w-1/2", "w-5/6", "w-2/3", "w-3/4", "w-1/3", "w-4/5", "w-3/5", "w-2/3", "w-1/2"];

type Kind = "before" | "main" | "after";
// at: the square's first token. from/to: the characters it stands for, estimated within its run.
type Cell = { kind: Kind; at: number; run: number; from: number; to: number };

const KIND: Record<Kind, { name: string; fill: string; mark: string }> = {
  before: { name: "Top menus", fill: "bg-faint/60", mark: "bg-faint/25" },
  main: { name: "Your content", fill: "bg-accent", mark: "bg-accent/20" },
  after: { name: "Footer & more", fill: "bg-faint/30", mark: "bg-faint/25" },
};

const kindOf = (runs: Run[], r: number, firstMain: number): Kind => (runs[r].main ? "main" : firstMain < 0 || r < firstMain ? "before" : "after");

// Where each run starts in the text, in characters.
const charOffsets = (runs: Run[]) => runs.reduce<number[]>((acc, r, i) => [...acc, i ? acc[i - 1] + runs[i - 1].chars : 0], []);

// Moves a character position back to the start of its word, or forward to the end of its word, within its run.
const wordStart = (text: string, at: number, min: number) => {
  while (at > min && !/\s/.test(text[at - 1])) at--;
  return at;
};
const wordEnd = (text: string, at: number, max: number) => {
  while (at < Math.min(max, text.length) && !/\s/.test(text[at])) at++;
  return at;
};

// Spreads the page's runs over CELLS squares, left to right and top to bottom.
// Each square takes the run at its middle token, and the share of that run's characters that its tokens cover.
function toCells(runs: Run[]): Cell[] {
  const total = runs.reduce((n, r) => n + r.tokens, 0);
  const firstMain = runs.findIndex((r) => r.main);
  const offsets = charOffsets(runs);
  const size = total / CELLS;
  const cells: Cell[] = [];
  let r = 0;
  let start = 0;
  for (let i = 0; i < CELLS; i++) {
    const mid = (i + 0.5) * size;
    while (mid > start + runs[r].tokens && r < runs.length - 1) start += runs[r++].tokens;
    const run = runs[r];
    const share = (t: number) => Math.min(1, Math.max(0, (t - start) / Math.max(1, run.tokens)));
    cells.push({
      kind: kindOf(runs, r, firstMain),
      at: Math.max(start, Math.round(i * size)),
      run: r,
      from: offsets[r] + Math.floor(share(i * size) * run.chars),
      to: offsets[r] + Math.ceil(share((i + 1) * size) * run.chars),
    });
  }
  return cells;
}

// The whole page in reading order: one square per slice of tokens, coloured like the bar above.
// Pointing at a square highlights its text in the panel below and scrolls to it.
export function AgentView({ m, fixtures = false }: { m: Measurement | null; fixtures?: boolean }) {
  const runs = m?.readingOrder ?? null;
  const cells = runs ? toCells(runs) : null;
  const firstMainCell = cells ? cells.findIndex((c) => c.kind === "main") : -1;
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? (firstMainCell >= 0 ? firstMainCell : null);
  const cell = cells && shown !== null ? cells[shown] : null;
  const before = m?.breakdown?.before;

  // The text panel shows the first PREVIEW_CHARS characters. Runs line up with it by character offset.
  const text = m ? m.preview.map((s) => s.text).join("") : "";
  const firstMainRun = runs ? runs.findIndex((r) => r.main) : -1;
  const offsets = runs ? charOffsets(runs) : [];
  // The highlight covers whole words. By default it starts exactly where your content starts.
  const mark = cell
    ? {
        from: active === null ? offsets[cell.run] : wordStart(text, cell.from, offsets[cell.run]),
        to: wordEnd(text, Math.max(cell.to, cell.from + 1), offsets[cell.run] + (runs?.[cell.run].chars ?? 0)),
      }
    : null;
  const inPanel = mark ? mark.from < text.length : false;

  // Scroll the panel, not the page, to the highlighted text: a third of the way down, so the lines before it show too.
  const panel = useRef<HTMLDivElement>(null);
  const markFrom = mark?.from;
  useEffect(() => {
    const box = panel.current;
    const mark = box?.querySelector<HTMLElement>("[data-mark]");
    if (box && mark) box.scrollTo({ top: Math.max(0, mark.offsetTop - box.clientHeight / 3), behavior: "smooth" });
  }, [markFrom]);

  return (
    <section className="mt-5 border-t border-line pt-4">
      <p className="label">What an agent reads, in order</p>
      <p className="mt-2 min-h-10 text-sm text-muted">
        {!m ? (
          <span className="block space-y-1.5 pt-1">
            <span className="skeleton h-2.5 w-3/4" />
            <span className="skeleton h-2.5 w-1/2" />
          </span>
        ) : before == null ? (
          <span className="fade">
            {fixtures
              ? "This page's main content was not saved in fixture mode, so we can't map it. A live run fills this in."
              : "We could not load this page's main content, so we can't map where it starts."}
          </span>
        ) : m.file ? (
          <span className="fade">A file has no menus, so an agent reads its content from the first token.</span>
        ) : before === 0 ? (
          <span className="fade">Your content starts at the very top. An agent reads it first.</span>
        ) : (
          <span className="fade">
            An agent reads <span className="font-mono font-medium text-fg">{num(before)}</span> tokens of top menus before it reaches your content.
          </span>
        )}
      </p>

      {/* Read like a page: start at the top left, end at the bottom right. */}
      <p className="mt-3 font-mono text-[10px] text-faint">Start of page</p>
      <div
        role="img"
        aria-label={cells ? `Reading-order map of the page in ${CELLS} squares.` : "Loading the reading-order map."}
        onMouseLeave={() => setActive(null)}
        className="mt-1 grid grid-cols-20 gap-[3px] sm:grid-cols-40"
      >
        {Array.from({ length: CELLS }, (_, i) => {
          const c = cells?.[i];
          if (!m) return <span key={i} className="skeleton aspect-square rounded-[3px]" />;
          // No map for this page: quiet empty squares, nothing to hover.
          if (!c) return <span key={i} className="fade aspect-square rounded-[3px] bg-track/60" />;
          // While pointing, the squares of the same run stay bright and the rest dim.
          const dim = active !== null && cells![active].run !== c.run;
          return (
            <span
              key={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`cell-in aspect-square rounded-[3px] transition-opacity duration-150 ${KIND[c.kind].fill} ${
                shown === i ? "ring-2 ring-fg/70 ring-offset-1 ring-offset-panel" : ""
              } ${dim ? "opacity-40" : ""}`}
              style={{ animationDelay: `${i * 3}ms` }}
            />
          );
        })}
      </div>
      {/* Two lines on phones, one on wider screens, reserved from the start so nothing below moves. */}
      <div className="mt-1 flex min-h-[30px] justify-between gap-3 font-mono text-[10px] leading-[15px] text-faint sm:min-h-[15px]">
        <span>{cells ? `Each square ≈ ${num(Math.max(1, Math.round((m?.markdown.tokens ?? 0) / CELLS)))} tokens. Point at one to find its text.` : ""}</span>
        <span className="shrink-0">End of page</span>
      </div>

      {/* The page's text. The top bar names the highlighted square; the body highlights its text. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-code">
        <div className="flex h-9 items-center gap-2.5 border-b border-line px-3 font-mono text-xs">
          {cell ? (
            <>
              <span className={`size-2 shrink-0 rounded-full ${KIND[cell.kind].fill}`} />
              <span className="shrink-0 text-muted">{active === null ? "Your content starts here" : KIND[cell.kind].name}</span>
              <span className="text-faint">· token {num(active === null && before != null ? before : cell.at)}</span>
              {!inPanel && <span className="truncate text-faint">· further down than the text shown</span>}
            </>
          ) : (
            <span className="text-faint">{m ? "The page as clean text (Markdown)" : ""}</span>
          )}
        </div>
        <div ref={panel} className="relative h-56 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {!m ? (
            <div className="space-y-3 pt-1">
              {PLACEHOLDER_WIDTHS.map((w, i) => (
                <span key={i} aria-hidden className={`skeleton h-2.5 ${w}`} />
              ))}
            </div>
          ) : runs ? (
            <div className="fade whitespace-pre-wrap break-words">
              {runs.map((r, i) => {
                const from = offsets[i];
                if (from >= text.length) return null;
                const to = from + r.chars;
                const colour = r.main ? "text-fg" : "text-code-dim";
                // The highlighted square's slice of text sits inside its run: before, highlight, after.
                if (!cell || cell.run !== i) return <span key={i} className={colour}>{text.slice(from, to)}</span>;
                return (
                  <span key={i} className={colour}>
                    {text.slice(from, mark!.from)}
                    <span data-mark className={`rounded-[3px] [box-decoration-break:clone] ${KIND[kindOf(runs, i, firstMainRun)].mark}`}>
                      {text.slice(mark!.from, mark!.to)}
                    </span>
                    {text.slice(mark!.to, to)}
                  </span>
                );
              })}
              {m.markdown.chars > text.length && <span className="mt-3 block font-sans text-faint">The rest of the page is not shown.</span>}
            </div>
          ) : (
            <div className="fade whitespace-pre-wrap break-words text-code-dim">{text}</div>
          )}
        </div>
      </div>
    </section>
  );
}
