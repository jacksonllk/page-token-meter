"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, LinkedInIcon, LinkIcon, RefreshIcon, ShareIcon, XIcon } from "./icons";

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
// saved: the result was measured earlier (cache, chip or share link), so the times are from that check, not this visit.
export function StepHeader({ saved = false }: { saved?: boolean }) {
  return (
    <div className="flex items-center gap-3 pb-1 text-[11px] text-faint">
      <span className="w-5" />
      <span className="flex-1">Step</span>
      <span className="shrink-0 text-right whitespace-nowrap">{saved ? "Time taken to measure" : "Finished in"}</span>
      <span className="w-4" />
    </div>
  );
}

// One step: number, name, what it does, and the time it finished (counting up while it runs).
// cached: context.dev answered with a copy it had already made. The time would not show a fresh load, so it says "Cached copy".
export function StepRow({
  n,
  name,
  state,
  startedAt,
  ms,
  detail,
  hint,
  cached = false,
}: {
  n: number;
  name: string;
  state: StepState;
  startedAt: number;
  ms?: number;
  detail?: string;
  hint?: string;
  cached?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 py-1.5 text-sm ${state === "waiting" || state === "skipped" || state === "unsaved" ? "text-faint" : "text-fg"}`}>
      <span className="w-5 pt-0.5 font-mono text-xs tabular-nums text-faint">{String(n).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{name}</span>
        {detail && state === "done" && <span className="appear ml-2 font-mono text-xs text-muted">{detail}</span>}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className="w-20 pt-0.5 text-right text-xs whitespace-nowrap">
        {state === "live" && <Seconds startedAt={startedAt} running className="text-accent-fg" />}
        {/* A saved result has no step times: nothing ran now. */}
        {state === "done" && cached && <span className="text-muted">Cached copy</span>}
        {state === "done" && !cached && ms !== undefined && <Seconds startedAt={startedAt} ms={ms} running={false} />}
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

// Run header: status on the left, elapsed time on the right while a check runs and once it is done.
// saved: the result was measured earlier (cache, chip or share link). It says so and shows no elapsed time:
// nothing ran on this visit. Its step times stay, under "Time taken to measure".
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
      ) : saved ? (
        <span className="label">● Saved result</span>
      ) : (
        <span className="label">● Complete</span>
      )}
      {!saved && (running || (finishedAt ?? startedAt) > startedAt) && (
        <span className="flex items-baseline gap-2">
          <span className="label">Elapsed</span>
          <Seconds startedAt={startedAt} ms={finishedAt ? finishedAt - startedAt : undefined} running={running} className="text-xs font-medium" />
        </span>
      )}
    </div>
  );
}

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-faint hover:text-fg";

// Next to "Measured <time>": share the result, and measure again when the result was saved earlier. Small, quiet buttons.
// Share: on a phone, the phone's own share menu with the headline and link filled in.
// On a computer, a menu: post on X or LinkedIn with the link filled in, or copy the link.
// title: the result's headline, such as "58,203 tokens to read the key pages of context.dev".
export function ResultActions({ id, title, onMeasureAgain }: { id: string; title: string; onMeasureAgain?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const link = () => `${location.origin}/r/${id}`;

  // Close the menu on a click outside it or on Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function share() {
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, text: title, url: link() });
        return;
      } catch (e) {
        // Closing the share menu is not an error. Anything else opens our own menu.
        if ((e as Error).name === "AbortError") return;
      }
    }
    setCopied(false);
    setOpen((o) => !o);
  }

  async function copy() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Clipboard blocked: open the link instead, so it can be copied from the address bar.
      router.push(`/r/${id}`);
    }
  }

  const post = (href: string) => {
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
  };
  const toX = () => post(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(link())}`);
  // LinkedIn takes only the link. Its preview shows the result's image and headline.
  const toLinkedIn = () => post(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link())}`);

  return (
    <span ref={box} className="relative flex shrink-0 items-center gap-1.5 font-sans">
      {onMeasureAgain && (
        <button type="button" onClick={onMeasureAgain} className={SECONDARY_BUTTON}>
          <RefreshIcon className="size-3" /> Measure again
        </button>
      )}
      <button type="button" onClick={share} aria-haspopup="menu" aria-expanded={open} className={SECONDARY_BUTTON}>
        {copied ? <CheckIcon className="size-3" /> : <ShareIcon className="size-3" />} Share
      </button>
      {/* Opens upwards: the panel clips anything below its last line. */}
      {open && (
        <span role="menu" className="appear absolute right-0 bottom-full z-10 mb-2 flex w-44 flex-col rounded-lg border border-line bg-panel p-1 text-xs text-fg shadow-md">
          <MenuItem onClick={toX} icon={<XIcon className="size-3" />} label="Post on X" />
          <MenuItem onClick={toLinkedIn} icon={<LinkedInIcon className="size-3" />} label="Post on LinkedIn" />
          <MenuItem onClick={copy} icon={<LinkIcon className="size-3" />} label="Copy link" />
          <span className="border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-faint">This link keeps this result.</span>
        </span>
      )}
      {/* What the copied link is: a snapshot, not the website's newest result. */}
      {copied && (
        <span role="status" className="appear absolute right-0 bottom-full z-10 mb-2 rounded-md bg-fg px-2.5 py-1.5 text-[11px] whitespace-nowrap text-bg shadow-sm">
          Copied. This link keeps this result.
        </span>
      )}
    </span>
  );
}

function MenuItem({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-track">
      <span className="flex w-3 justify-center text-muted">{icon}</span>
      {label}
    </button>
  );
}

// A website's logo (lib/logo.ts), loaded from that website without a referrer. Hidden if it does not load.
export function SiteLogo({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- any website's address: next/image needs a fixed list of hosts
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="fade size-4 shrink-0 rounded-[3px]" />;
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
