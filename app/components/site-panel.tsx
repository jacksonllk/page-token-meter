"use client";

import { isChip } from "@/lib/chips";
import { fileType } from "@/lib/files";
import { MAP_LIMIT } from "@/lib/keypages";
import { measuredAt, num, pct } from "@/lib/format";
import { shareText } from "@/lib/share-text";
import type { SitePageRun, SiteRun } from "./runs";
import { ResultActions, RollingNumber, RunHeader, SiteLogo, Skeleton, SmoothHeight, StepHeader, StepRow } from "./telemetry";

// One measured page or file: name, address, tokens. A page also shows its share of the total as a bar.
function PageRow({ p, i, total, onOpenPage }: { p: SitePageRun; i: number; total: number | null; onOpenPage?: (url: string) => void }) {
  const type = fileType(p.url);
  return (
    <li className="fade" style={{ animationDelay: `${i * 40}ms` }}>
      <button
        type="button"
        disabled={!onOpenPage || !p.markdown}
        onClick={() => onOpenPage?.(p.url)}
        className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition enabled:hover:bg-accent-soft disabled:cursor-default"
      >
        <span className="flex h-5 items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate">
            <span className={`text-sm ${p.state === "waiting" ? "text-faint" : "font-medium"}`}>{p.role}</span>
            {type && <span className="ml-2 rounded border border-line px-1 py-px font-mono text-[10px] text-muted">{type}</span>}
            <span className="ml-2 font-mono text-[11px] text-faint" title={p.url}>
              {p.url.replace(/^https?:\/\/(www\.)?/, "")}
            </span>
          </span>
          <span className="shrink-0 text-sm">
            {p.state === "live" && <span className="live-dot text-accent-fg">●</span>}
            {p.state === "failed" && <span className="text-xs text-red-500">{p.error ?? "Failed"}</span>}
            {p.markdown && <RollingNumber value={p.markdown.tokens} className="font-medium" />}
            {p.markdown && total !== null && total > 0 && <span className="ml-1.5 font-mono text-xs text-muted">{pct(p.markdown.tokens / total)}</span>}
            {p.markdown && onOpenPage && <span className="ml-1.5 text-faint">›</span>}
            {p.state === "waiting" && <span className="text-faint">—</span>}
          </span>
        </span>
        {total !== null && (
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-track">
            <span
              className={`block h-full rounded-full transition-[width] duration-700 ease-out ${p.state === "live" ? "live-dot bg-accent/40" : "bg-accent"}`}
              style={{ width: p.markdown && total > 0 ? pct(p.markdown.tokens / total) : p.state === "live" ? "4%" : "0%" }}
            />
          </span>
        )}
      </button>
    </li>
  );
}

// The Site view: the total first, then one bar per key page, filling in as each page is measured.
// shared: the share page, where the page rows do not open.
export function SitePanel({
  run,
  onOpenPage,
  onMeasureAgain,
  shared = false,
}: {
  run: SiteRun;
  onOpenPage?: (url: string) => void;
  onMeasureAgain?: () => void;
  shared?: boolean;
}) {
  const running = run.finishedAt === undefined;
  const failed = Boolean(run.error);
  const pages = run.pages ?? [];
  // Files from an llms.txt are listed apart and not added to the total.
  const pageRows = pages.filter((p) => !p.file);
  const fileRows = pages.filter((p) => p.file);
  const total = pageRows.reduce((sum, p) => sum + (p.markdown?.tokens ?? 0), 0);
  const pagesDone = pages.filter((p) => p.state === "done" || p.state === "failed").length;
  // When the last page finished. A result saved before 5 Nov has no page times.
  const lastPageMs = pagesDone === pages.length && pages.length > 0 && pages.every((p) => p.ms !== undefined) ? Math.max(...pages.map((p) => p.ms!)) : undefined;
  // Pages context.dev answered from a copy it had already made. When all were, step 04 shows "Cached copy", not a time.
  const cachedPages = pages.filter((p) => p.cached).length;

  return (
    <article className="appear rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <RunHeader running={running} failed={failed} startedAt={run.startedAt} finishedAt={run.finishedAt} saved={run.saved} />
      <p className="mt-2.5 flex h-4 items-center gap-1.5 font-mono text-xs text-muted">
        <SiteLogo src={run.result?.logo} />
        Key pages of {run.domain}
      </p>

      <SmoothHeight>
        {/* 1. The answer */}
        <div className="mt-4">
          <p className="label">Tokens to read your key pages</p>
          <RollingNumber value={pageRows.some((p) => p.markdown) ? total : null} className="mt-1 block text-5xl font-semibold tracking-tight" />
          <p className="mt-1 text-sm text-muted">Tokens needed to read all these pages as Markdown, including everything around their main content.</p>
        </div>

        {/* 2. One bar per page, on the same scale. Placeholder rows hold the space until the pages are picked. */}
        {pages.length === 0 && !failed && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="label">Tokens per page</p>
            <p className="mt-2 text-xs text-muted">Each bar is the page&apos;s share of the total. Click a page to see how many tokens are needed to read it.</p>
            <ul className="mt-3 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="py-1">
                  <span className="flex h-5 items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-16" />
                  </span>
                  <span className="mt-1 block h-1.5 rounded-full bg-track" />
                </li>
              ))}
            </ul>
          </div>
        )}
        {pages.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="label">Tokens per page</p>
            <p className="mt-2 text-xs text-muted">
              Each bar is the page&apos;s share of the total.{!shared && " Click a page to see what its tokens are spent on."}
            </p>
            <ul className="mt-3 space-y-3">
              {pageRows.map((p, i) => (
                <PageRow key={p.url} p={p} i={i} total={total} onOpenPage={onOpenPage} />
              ))}
            </ul>

            {/* Files the llms.txt points to: measured, but not part of the page total. */}
            {fileRows.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium">Files listed in your llms.txt</p>
                <p className="mt-0.5 text-xs text-muted">These are files, such as an API spec, not web pages. Their tokens are not included in the total above.</p>
                <ul className="mt-2 space-y-1">
                  {fileRows.map((p, i) => (
                    <PageRow key={p.url} p={p} i={pageRows.length + i} total={null} onOpenPage={onOpenPage} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 3. How the website was analysed: the live steps, always visible. */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="label">How the website was analysed</p>
          <div className="mt-2">
            <StepHeader saved={run.saved} />
            <StepRow
              n={1}
              name="Map the website"
              hint="List the page addresses on your website."
              state={run.map || run.picked ? "done" : failed ? "failed" : "live"}
              startedAt={run.startedAt}
              ms={run.map?.ms ?? run.picked?.ms}
              // Map returns at most MAP_LIMIT addresses. At that number, the website has at least that many pages.
              detail={run.map ? `${num(run.map.urlCount)}${run.map.urlCount >= MAP_LIMIT ? "+" : ""} found` : undefined}
            />
            <StepRow
              n={2}
              name="Look for llms.txt"
              hint="Check for a list of pages a website wants AI agents to read."
              state={run.llms || run.picked ? "done" : failed ? "failed" : run.map ? "live" : "waiting"}
              startedAt={run.startedAt}
              ms={run.llms?.ms ?? run.picked?.ms}
              detail={run.llms ? (run.llms.url ? "found" : "none") : undefined}
            />
            <StepRow
              n={3}
              name="Choose what to measure"
              hint="Pick key pages such as home, pricing, docs and the API reference."
              state={run.picked ? "done" : failed ? "failed" : "waiting"}
              startedAt={run.startedAt}
              ms={run.picked?.ms}
              detail={run.picked ? `${pages.length} picked` : undefined}
            />
            <StepRow
              n={4}
              name="Load each page"
              hint="Open each page in a real browser, run its scripts, and convert it to Markdown."
              state={pagesDone === pages.length && pages.length > 0 ? "done" : failed ? "failed" : run.picked ? "live" : "waiting"}
              startedAt={run.startedAt}
              ms={lastPageMs}
              cached={pages.length > 0 && cachedPages === pages.length}
              detail={run.picked ? `${pagesDone} of ${pages.length}${cachedPages > 0 && cachedPages < pages.length ? `, ${cachedPages} cached` : ""}` : undefined}
            />
            <StepRow
              n={5}
              name="Count the tokens"
              hint="Count each page's tokens and add them up."
              state={run.result ? "done" : failed ? "failed" : pagesDone > 0 ? "live" : "waiting"}
              startedAt={run.startedAt}
              // The server's own time, like the steps above. Without it, the time this browser waited.
              ms={run.result?.steps?.total ?? (run.finishedAt && run.finishedAt > run.startedAt ? run.finishedAt - run.startedAt : undefined)}
            />
          </div>
        </div>

        <div className="mt-4 min-h-8 border-t border-line pt-3 font-mono text-[11px] text-faint">
          {run.result ? (
            <div className="fade">
              <div className="flex items-center justify-between gap-3">
                <p>Measured on {measuredAt(run.result.measuredAt)}</p>
                <ResultActions id={run.result.id} title={shareText({ kind: "site", result: run.result }).title} onMeasureAgain={run.saved && !isChip(run.domain) ? onMeasureAgain : undefined} />
              </div>
              <p>Tokens counted with OpenAI&apos;s o200k tokenizer.</p>
            </div>
          ) : (
            <Skeleton className="h-2.5 w-1/3" />
          )}
        </div>
      </SmoothHeight>
    </article>
  );
}
