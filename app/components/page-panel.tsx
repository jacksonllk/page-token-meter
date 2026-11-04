"use client";

import { fileType } from "@/lib/files";
import { measuredAt, num, pct } from "@/lib/format";
import { AgentView } from "./agent-view";
import type { PageRun } from "./runs";
import { ResultActions, RollingNumber, RunHeader, Skeleton, SmoothHeight, StepHeader, StepRow, type StepState } from "./telemetry";

function stepState(done: unknown, live: boolean, failed: boolean): StepState {
  if (done) return "done";
  if (failed) return "failed";
  return live ? "live" : "waiting";
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-4">
      <p className="label">{label}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// One part of the token bar, for the legend: colour dot, name, what it is, and its tokens.
function LegendItem({ dot, name, hint, tokens, align = "left" }: { dot: string; name: string; hint: string; tokens: number | null; align?: "left" | "right" | "center" }) {
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
  return (
    <div className={alignment}>
      <p className="text-xs font-medium">
        <span className={`mr-1.5 inline-block size-2 rounded-full ${dot}`} />
        {name}
      </p>
      <p className="text-[11px] leading-tight text-faint">{hint}</p>
      <RollingNumber value={tokens} className="mt-0.5 block text-xs" />
    </div>
  );
}

// A file the page offers to AI tools: tick, cross or dash (could not check), its name, a size chip and a link.
function FileRow({ ok, name, chip, href }: { ok: boolean | "unknown" | null; name: string; chip?: string; href?: string }) {
  return (
    <div className="flex h-8 items-center gap-2.5 text-sm">
      {ok === null ? (
        <Skeleton className="size-5 rounded-full" />
      ) : (
        <span
          className={`fade flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${ok === true ? "bg-accent text-white" : "bg-track text-muted"}`}
        >
          {ok === true ? "✓" : ok === false ? "✕" : "–"}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${ok !== true ? "text-muted" : ""}`}>{name}</span>
      {chip && <span className="fade shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">{chip}</span>}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="fade shrink-0 text-xs font-medium text-accent-fg hover:underline">
          View ↗
        </a>
      )}
    </div>
  );
}

// The Page view: the answer first, then the page in reading order, then how we got it.
// Every section is in place from the start; values fade in as each context.dev call returns.
// fixtures: in fixture mode some answers were never saved. Those steps say "Not saved", not "Failed".
// onMeasureAgain: shown for a saved result. shared: the share page, where the page text is not kept.
export function PagePanel({
  run,
  fixtures = false,
  onMeasureAgain,
  shared = false,
}: {
  run: PageRun;
  fixtures?: boolean;
  onMeasureAgain?: () => void;
  shared?: boolean;
}) {
  const running = run.finishedAt === undefined;
  const failed = Boolean(run.error);
  const md = run.full?.markdown;
  const main = run.main?.mainContent;
  const published = run.published?.published;
  const result = run.result;
  const links = run.full?.links;
  const breakdown = result?.breakdown ?? null;
  // Before the split is ready, the bar shows the main-content share from step 2.
  const contentShare = md && md.tokens > 0 ? (breakdown ? breakdown.main : (main?.tokens ?? 0)) / md.tokens : null;
  // The main-content call failed, so the page cannot be split. The bar shows the whole page in one colour.
  const unsplit = Boolean(result && !breakdown);
  // A file (JSON, Markdown, text...) has no menus or footer: the main-content and Markdown-version steps are skipped.
  const file = fileType(run.url);
  const mainMissing = Boolean(run.main && !run.main.mainContent);

  return (
    <article className="appear rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <RunHeader running={running} failed={failed} startedAt={run.startedAt} finishedAt={run.finishedAt} saved={run.saved} />
      <p className="mt-1 truncate font-mono text-xs text-muted" title={run.url}>
        {run.url}
      </p>

      <SmoothHeight>
        {/* 1. The answer */}
        <div className="mt-4">
          <p className="label">{file ? "Tokens to read this file" : "Tokens to read this page"}</p>
          <RollingNumber value={md?.tokens} className="mt-1 block text-5xl font-semibold tracking-tight" />
          <p className="mt-1 text-sm text-muted">
            {file
              ? `AI models read text in small pieces called tokens. This is a ${file} file, not a web page. This is how many tokens it takes to read all of it.`
              : "AI models read text in small pieces called tokens. This is how many tokens it takes to read this page as clean text (Markdown)."}
          </p>

          {/* Where the tokens go, top to bottom: three parts once the page is split, two while waiting. */}
          <div className="mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-track">
              {unsplit && <div className="fade w-full bg-faint/40" />}
              <div className="bg-faint/60 transition-[width] duration-700 ease-out" style={{ width: pct(breakdown && md ? breakdown.before / md.tokens : 0) }} />
              <div className="bg-accent transition-[width] duration-700 ease-out" style={{ width: pct(contentShare ?? 0) }} />
              <div className="bg-faint/30 transition-[width] duration-700 ease-out" style={{ width: pct(breakdown && md ? breakdown.after / md.tokens : 0) }} />
            </div>
            {/* Same height in both states, so nothing below moves. */}
            <div className="mt-2 min-h-[3.25rem]">
              {file ? (
                <p className="text-xs text-muted">A file has no menus or footer, so every token is content.</p>
              ) : unsplit ? (
                <p className="fade text-xs text-muted">
                  {fixtures
                    ? "This page's main content was not saved in fixture mode, so we can't split its tokens. A live run fills this in."
                    : "We could not load this page's main content, so we can't split its tokens into menus, content and footer."}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <LegendItem dot="bg-faint/60" name="Top menus" hint="before your content" tokens={breakdown?.before ?? null} />
                  <LegendItem dot="bg-accent" name="Your content" hint="the page itself" tokens={breakdown?.main ?? main?.tokens ?? null} align="center" />
                  <LegendItem dot="bg-faint/30" name="Footer & more" hint="sidebars, footer" tokens={breakdown?.after ?? null} align="right" />
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              {file ? "Whole file." : unsplit ? "Whole page, not split." : "Approximate split of this page's text, top to bottom."}
            </p>
          </div>

          {/* Files this page offers to AI tools. Not shown for a file: it is already plain text.
              -mb-3 trims the next section's mt-5 to 8px, so the space below the rows matches the pt-2 above them. */}
          {!file && (
            <div className="mt-3 -mb-3 border-t border-line pt-2">
              <FileRow
                ok={published ? (published.status === "unknown" || published.status === "unconfirmed" ? "unknown" : published.status === "offered") : failed ? false : null}
                name={
                  !published || published.status === "offered"
                    ? "Markdown version"
                    : published.status === "not_offered"
                      ? "No Markdown version found"
                      : published.status === "unconfirmed"
                        ? "Markdown version: could not confirm"
                        : fixtures
                        ? "Markdown version: not saved in fixture mode"
                        : "Markdown version: could not check"
                }
                chip={published?.status === "offered" && published.tokens !== undefined ? `${num(published.tokens)} tokens` : undefined}
                href={published?.status === "offered" ? (result?.published.url ?? links?.markdown ?? undefined) : undefined}
              />
              {links?.llmsTxt && <FileRow ok name="llms.txt (site index for AI)" href={links.llmsTxt} />}
            </div>
          )}
        </div>

        {/* 2. The page in reading order, next to the bar it shares colours with */}
        {!shared && <AgentView m={result ?? null} fixtures={fixtures} />}

        {/* 3. How we got this: the live steps */}
        <Section label="How we got this">
          <StepHeader />
          <StepRow
            n={1}
            name={file ? "Load the file" : "Load the full page"}
            hint={file ? "Read the file as text." : "Convert the whole page into Markdown."}
            state={stepState(run.full, running, failed)}
            startedAt={run.startedAt}
            ms={run.full?.ms}
          />
          <StepRow
            n={2}
            name="Load only the main content"
            hint={
              file
                ? "Skip this step. A file has no menus or footer."
                : "Remove menus, links and footer from the page."
            }
            state={file && run.main ? "skipped" : mainMissing ? (fixtures ? "unsaved" : "failed") : stepState(run.main, running, failed)}
            startedAt={run.startedAt}
            ms={run.main?.ms}
          />
          <StepRow
            n={3}
            name="Look for a published Markdown version"
            hint={file ? "Skip this step. A file is already plain text." : "Check if the website publishes a Markdown copy of this page."}
            state={
              published?.status === "skipped"
                ? "skipped"
                : published?.status === "unknown"
                  ? fixtures
                    ? "unsaved"
                    : "failed"
                  : stepState(run.published, running && Boolean(run.full || run.main), failed)
            }
            startedAt={run.startedAt}
            ms={run.published?.ms}
          />
          <StepRow
            n={4}
            name="Count the tokens"
            hint="Count the tokens with OpenAI's o200k tokenizer."
            state={result ? "done" : failed ? "failed" : run.full ? "live" : "waiting"}
            startedAt={run.startedAt}
            ms={run.finishedAt && !run.saved ? run.finishedAt - run.startedAt : undefined}
          />
        </Section>


        {/* Two fixed lines, so the cards below do not move when the values arrive. */}
        <div className="mt-4 h-11 border-t border-line pt-3 font-mono text-[11px] leading-4 text-faint">
          {result ? (
            <div className="fade">
              <div className="flex items-center justify-between gap-3">
                <p>Measured {measuredAt(result.measuredAt)}</p>
                <ResultActions id={result.id} onMeasureAgain={run.saved ? onMeasureAgain : undefined} />
              </div>
              {result.html.tokens > 0 && (
                <p className="truncate">
                  Full page code (HTML): {num(result.html.tokens)} tokens, {Math.round(result.html.tokens / Math.max(1, result.markdown.tokens))}× the clean text
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5 pt-0.5">
              <Skeleton className="h-2.5 w-1/3" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          )}
        </div>
      </SmoothHeight>
    </article>
  );
}
