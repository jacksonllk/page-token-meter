"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const format = (n: number, decimals: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// A number that rolls quickly from its last value up to the new one.
export function RollingNumber({
  value,
  decimals = 0,
  duration = 700,
  className = "",
}: {
  value: number | null | undefined;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (value == null) return;
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = prefersReducedMotion() ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(begin + (value - begin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  // Before the value arrives, show a faint zero that the real number rolls up from.
  if (value == null) return <span className={`font-mono tabular-nums text-faint ${className}`}>{format(0, decimals)}</span>;
  return <span className={`font-mono tabular-nums ${className}`}>{format(shown, decimals)}</span>;
}

// The current time, updated every frame-ish while `active` is true.
function useNow(active: boolean, start: number) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 31);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// Seconds since the run started. Counts up live while running, then stops at the real time.
export function Seconds({ startedAt, ms, running, className = "" }: { startedAt: number; ms?: number; running: boolean; className?: string }) {
  const now = useNow(running && ms === undefined, startedAt);
  const value = ms ?? Math.max(0, now - startedAt);
  return <span className={`font-mono tabular-nums ${className}`}>{format(value / 1000, 2)} s</span>;
}

// "skipped": not needed for this page, such as the main-content step for a file. "unsaved": fixture mode has no saved answer.
export type StepState = "waiting" | "live" | "done" | "failed" | "skipped" | "unsaved";

// Column header for a step list. Times show when each step finished, counted from the start.
export function StepHeader() {
  return (
    <div className="flex items-center gap-3 pb-1 text-[11px] text-faint">
      <span className="w-5" />
      <span className="flex-1">Step</span>
      <span className="w-16 text-right whitespace-nowrap">Finished in</span>
      <span className="w-4" />
    </div>
  );
}

// One step: number, name, what it does, and the time it finished (counting up while it runs).
export function StepRow({
  n,
  name,
  state,
  startedAt,
  ms,
  detail,
  hint,
}: {
  n: number;
  name: string;
  state: StepState;
  startedAt: number;
  ms?: number;
  detail?: string;
  hint?: string;
}) {
  return (
    <div className={`flex items-start gap-3 py-1.5 text-sm ${state === "waiting" || state === "skipped" || state === "unsaved" ? "text-faint" : "text-fg"}`}>
      <span className="w-5 pt-0.5 font-mono text-xs tabular-nums text-faint">{String(n).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{name}</span>
        {detail && state === "done" && <span className="appear ml-2 font-mono text-xs text-muted">{detail}</span>}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className="w-16 pt-0.5 text-right text-xs">
        {state === "live" && <Seconds startedAt={startedAt} running className="text-accent-fg" />}
        {/* A saved result has no step times: nothing ran now. */}
        {state === "done" && ms !== undefined && <Seconds startedAt={startedAt} ms={ms} running={false} />}
        {state === "failed" && <span className="text-red-500">Failed</span>}
        {state === "waiting" && "—"}
        {state === "skipped" && <span className="text-faint">Skipped</span>}
        {state === "unsaved" && <span className="text-faint">Not saved</span>}
      </span>
      <span className="w-4 pt-0.5 text-right">
        {state === "done" && <span className="appear text-accent-fg">✓</span>}
        {state === "live" && <span className="live-dot text-accent-fg">●</span>}
      </span>
    </div>
  );
}

// While a run is going: a 3×3 grid where a short snake runs around the edge one square at a time, 8-bit style.
// SNAKE_PATH is each grid square's place on the loop, clockwise from the top left. The centre (null) stays dim.
const SNAKE_PATH = [0, 1, 2, 7, null, 3, 6, 5, 4];
const SNAKE_STEP_MS = 100;

function ScanMark() {
  return (
    <span aria-hidden className="grid grid-cols-3 gap-px">
      {SNAKE_PATH.map((place, i) =>
        place === null ? (
          <span key={i} className="size-1 rounded-[1px] bg-accent-fg opacity-10" />
        ) : (
          // A negative delay starts each square mid-loop, so the snake is already running on the first frame.
          <span key={i} className="snake-cell size-1 rounded-[1px] bg-accent-fg" style={{ animationDelay: `${(place - 8) * SNAKE_STEP_MS}ms` }} />
        ),
      )}
    </span>
  );
}

// Run header: status on the left, elapsed time on the right. A saved result shows no elapsed time.
export function RunHeader({
  running,
  failed,
  startedAt,
  finishedAt,
  saved = false,
}: {
  running: boolean;
  failed: boolean;
  startedAt: number;
  finishedAt?: number;
  saved?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      {failed ? (
        <span className="label !text-red-500">● Failed</span>
      ) : running ? (
        <span className="label inline-flex items-center gap-2 !text-accent-fg">
          <ScanMark /> Measuring
        </span>
      ) : (
        <span className="label">● Complete</span>
      )}
      {!saved && (
        <span className="flex items-baseline gap-2">
          <span className="label">Elapsed</span>
          <Seconds startedAt={startedAt} ms={finishedAt ? finishedAt - startedAt : undefined} running={running} className="text-xs font-medium" />
        </span>
      )}
    </div>
  );
}

// Next to "Measured <time>": copy the share link, and measure again when the result was saved earlier.
export function ResultActions({ id, onMeasureAgain }: { id: string; onMeasureAgain?: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/r/${id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: open the link instead, so it can be copied from the address bar.
      router.push(`/r/${id}`);
    }
  }
  return (
    <span className="flex shrink-0 items-center gap-3 font-sans text-xs">
      {onMeasureAgain && (
        <button type="button" onClick={onMeasureAgain} className="text-muted hover:text-fg">
          Measure again
        </button>
      )}
      <button type="button" onClick={copy} className="font-medium text-accent-fg hover:underline">
        {copied ? "Link copied" : "Copy link"}
      </button>
    </span>
  );
}

// A grey placeholder bar that holds space for text or a number that has not arrived yet.
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton ${className}`} />;
}

// Grows and shrinks smoothly when its content changes size, instead of jumping.
export function SmoothHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="overflow-y-clip transition-[height] duration-300 ease-out motion-reduce:transition-none" style={{ height }}>
      <div ref={inner} className="flow-root">
        {children}
      </div>
    </div>
  );
}
