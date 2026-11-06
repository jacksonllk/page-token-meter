"use client";

import { useEffect, useRef } from "react";
import type { Measurement, Run } from "@/lib/measure";
import { num } from "@/lib/format";
import { HEAT_CELLS, squareAt, squareStart } from "@/lib/heat";

const PLACEHOLDER_WIDTHS = ["w-1/2", "w-5/6", "w-2/3", "w-3/4", "w-1/3", "w-4/5", "w-3/5", "w-2/3", "w-1/2"];

type Kind = "before" | "main" | "after";

const KIND: Record<Kind, { name: string; dot: string; mark: string }> = {
  before: { name: "Read before main content", dot: "bg-faint/60", mark: "bg-faint/25" },
  main: { name: "Main content", dot: "bg-accent", mark: "bg-accent/20" },
  after: { name: "Read after main content", dot: "bg-faint/30", mark: "bg-faint/25" },
};

// Where each run starts in the text, in characters.
const charOffsets = (runs: Run[]) => runs.reduce<number[]>((acc, r, i) => [...acc, i ? acc[i - 1] + runs[i - 1].chars : 0], []);

// Moves a character position back to the start of its word, or forward to the end of its word.
const wordStart = (text: string, at: number) => {
  while (at > 0 && !/\s/.test(text[at - 1])) at--;
  return at;
};
const wordEnd = (text: string, at: number) => {
  while (at < text.length && !/\s/.test(text[at])) at++;
  return at;
};

// The page's text in reading order, main content dark and the rest dim.
// point: the token map square clicked. Its text is highlighted and scrolled into view.
// With no square clicked, the highlight marks where the main content starts.
export function AgentView({ m, point, fixtures = false }: { m: Measurement | null; point: number | null; fixtures?: boolean }) {
  const runs = m?.readingOrder ?? null;
  const before = m?.breakdown?.before;
  const start = m?.contentStartChar ?? null;

  // The text panel shows the first PREVIEW_CHARS characters. Runs line up with it by character offset.
  const text = m ? m.preview.map((s) => s.text).join("") : "";
  const offsets = runs ? charOffsets(runs) : [];

  // The highlighted stretch of text, whole words only, and which part of the page it is in.
  let mark: { from: number; to: number; kind: Kind } | null = null;
  if (m && runs && start !== null) {
    if (point === null) {
      mark = { from: start, to: wordEnd(text, Math.max(start + 1, squareStart(m, squareAt(m, start) + 1))), kind: "main" };
    } else {
      const from = wordStart(text, squareStart(m, point));
      const level = m.heat?.[point] ?? 0;
      mark = { from, to: wordEnd(text, Math.max(from + 1, squareStart(m, point + 1))), kind: level > 0 ? "main" : from < start ? "before" : "after" };
    }
  }
  const inPanel = mark ? mark.from < text.length : false;

  // Scroll the panel, not the page, to the highlighted text: a third of the way down, so the lines before it show too.
  const panel = useRef<HTMLDivElement>(null);
  const markFrom = mark?.from;
  useEffect(() => {
    const box = panel.current;
    const el = box?.querySelector<HTMLElement>("[data-mark]");
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 3), behavior: "smooth" });
  }, [markFrom]);

  // One run's text, split around the highlight where they overlap.
  const runText = (r: Run, i: number) => {
    const from = offsets[i];
    if (from >= text.length) return null;
    const to = Math.min(text.length, from + r.chars);
    const colour = r.main ? "text-fg" : "text-code-dim";
    if (!mark || mark.to <= from || mark.from >= to) return <span key={i} className={colour}>{text.slice(from, to)}</span>;
    const a = Math.max(from, mark.from);
    const b = Math.min(to, mark.to);
    return (
      <span key={i} className={colour}>
        {text.slice(from, a)}
        <span data-mark={a === mark.from ? "" : undefined} className={`rounded-[3px] [box-decoration-break:clone] ${KIND[mark.kind].mark}`}>
          {text.slice(a, b)}
        </span>
        {text.slice(b, to)}
      </span>
    );
  };

  return (
    <section className="mt-5 border-t border-line pt-4">
      <p className="label">What an agent reads</p>
      <p className="mt-2 min-h-10 text-sm text-muted">
        {!m ? (
          <span className="block space-y-1.5 pt-1">
            <span className="skeleton h-2.5 w-3/4" />
            <span className="skeleton h-2.5 w-1/2" />
          </span>
        ) : before == null ? (
          <span className="fade">
            {fixtures
              ? "This page's main content was not saved in fixture mode, so we can't mark where it starts. A live run fills this in."
              : "We could not load this page's main content, so we can't mark where it starts."}
          </span>
        ) : m.file ? (
          <span className="fade">A file has no menus, so an agent reads its content from the first token.</span>
        ) : before === 0 ? (
          <span className="fade">The main content starts at the very top. An agent reads it first.</span>
        ) : (
          <span className="fade">
            An agent reads <span className="font-mono font-medium text-fg">{num(before)}</span> tokens before it reaches the main content.
          </span>
        )}
      </p>

      {/* The page's text. The top bar names the highlighted part; the body highlights its text. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-code">
        <div className="flex h-9 items-center gap-2.5 border-b border-line px-3 font-mono text-xs">
          {mark ? (
            <>
              <span className={`size-2 shrink-0 rounded-full ${KIND[mark.kind].dot}`} />
              <span className="shrink-0 text-muted">{point === null ? "The main content starts here" : KIND[mark.kind].name}</span>
              {point !== null && (
                <span className="text-faint">
                  · square {point + 1} of {HEAT_CELLS}
                  {m?.links?.squares[point] ? " · mostly links" : ""}
                </span>
              )}
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
              {runs.map(runText)}
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
