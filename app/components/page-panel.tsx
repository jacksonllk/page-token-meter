"use client";

import { fileType } from "@/lib/files";
import { useState } from "react";
import { measuredAt, num, pct } from "@/lib/format";
import { shareText } from "@/lib/share-text";
import { heatFromBreakdown } from "@/lib/heat";
import { AgentView } from "./agent-view";
import { HeatLegend, Heatmap } from "./heatmap";
import type { PageRun } from "./runs";
import { ResultActions, RollingNumber, RunHeader, SiteLogo, Skeleton, SmoothHeight, StepHeader, StepRow, type StepState } from "./telemetry";

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

// One part of the page, next to the heatmap: its share of the tokens, large and centred beside its name,
// what it usually holds, and its tokens.
function ZoneStat({ name, hint, tokens, total }: { name: string; hint: string; tokens: number | null; total: number | null }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-16 shrink-0 font-mono text-3xl leading-none font-medium tracking-tight tabular-nums">
        {tokens !== null && total ? <span className="fade">{pct(tokens / total)}</span> : <Skeleton className="h-7 w-14" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-xs font-medium">{name}</span>
          <RollingNumber value={tokens} className="shrink-0 text-[11px] text-faint" />
        </span>
        <span className="block text-[11px] leading-snug text-faint">{hint}</span>
      </span>
    </li>
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
  const published = run.published?.published;
  const result = run.result;
  const links = run.full?.links;
  const breakdown = result?.breakdown ?? null;
  // Results saved before the heatmap existed get a coarser one from their three-part split.
  const heat = result ? (result.heat ?? (breakdown ? heatFromBreakdown(breakdown) : null)) : null;
  // The main-content call failed, so the page cannot be split, and there is no heatmap.
  const unsplit = Boolean(result && !breakdown);
  // The heatmap block being pointed at, so the text panel below can show its text.
  const [point, setPoint] = useState<number | null>(null);
  // A file (JSON, Markdown, text...) has no menus or footer: the main-content and Markdown-version steps are skipped.
  const file = fileType(run.url);
  const mainMissing = Boolean(run.main && !run.main.mainContent);

  return (
    <article className="appear rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <RunHeader running={running} failed={failed} startedAt={run.startedAt} finishedAt={run.finishedAt} />
      <p className="mt-2.5 flex h-4 items-center gap-1.5 font-mono text-xs text-muted" title={run.url}>
        <SiteLogo src={result?.logo} />
        <span className="truncate">{run.url}</span>
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

          {/* Where the content is: the page as a heatmap, next to its three parts. */}
          {/* The key sits at the bottom of the right column, level with the heatmap's bottom edge. */}
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-5">
            <Heatmap heat={heat} empty={unsplit} active={point} onPoint={shared ? undefined : setPoint} />
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
              {file ? (
                <p className="text-xs text-muted">A file has no menus or footer, so every token is content.</p>
              ) : unsplit ? (
                <p className="fade text-xs text-muted">
                  {fixtures
                    ? "This page's main content was not saved in fixture mode, so we can't map it. A live run fills this in."
                    : "We could not load this page's main content, so we can't map it."}
                </p>
              ) : (
                <ul className="space-y-3">
                  <ZoneStat
                    name="Read before main content"
                    hint="Menus, banners, cookie notices, breadcrumbs, and sidebars."
                    tokens={breakdown?.before ?? null}
                    total={md?.tokens ?? null}
                  />
                  <ZoneStat name="Main content" hint="The page's own text: the article, docs or product copy." tokens={breakdown?.main ?? null} total={md?.tokens ?? null} />
                  <ZoneStat name="Read after main content" hint="Related links, sign-up boxes, the footer, and sidebars." tokens={breakdown?.after ?? null} total={md?.tokens ?? null} />
                </ul>
              )}
              <div className="space-y-1">
                <HeatLegend />
                <p className="text-[11px] text-faint">
                  The page&rsquo;s text in the order an agent reads it.
                  {!shared && !unsplit && " Point at a block to see its text below."}
                </p>
              </div>
            </div>
          </div>

          {/* Files this page offers to AI tools. Not shown for a file: it is already plain text.
              -mb-3 trims the next section's mt-5 to 8px, so the space below the rows matches the pt-2 above them. */}
          {!file && (
            <div className="mt-3 -mb-3 border-t border-line pt-2">
              <FileRow
                ok={published ? (published.status === "unknown" || published.status === "unconfirmed" ? "unknown" : published.status === "offered") : failed ? false : null}
                name={
                  !published || published.status === "offered"
                    ? "This page has a published Markdown version"
                    : published.status === "not_offered"
                      ? "This page has no published Markdown version"
                      : published.status === "unconfirmed"
                        ? "Could not confirm a published Markdown version"
                        : fixtures
                        ? "Published Markdown version: not saved in fixture mode"
                        : "Could not check for a published Markdown version"
                }
                chip={published?.status === "offered" && published.tokens !== undefined ? `${num(published.tokens)} tokens` : undefined}
                href={published?.status === "offered" ? (result?.published.url ?? links?.markdown ?? undefined) : undefined}
              />
              {links?.llmsTxt && <FileRow ok name="llms.txt (website index for AI)" href={links.llmsTxt} />}
            </div>
          )}
        </div>

        {/* 2. The page's text in reading order, showing the heatmap block being pointed at */}
        {!shared && <AgentView m={result ?? null} point={point} fixtures={fixtures} />}

        {/* 3. How the page was analysed: the live steps */}
        <Section label="How the page was analysed">
          <StepHeader />
          <StepRow
            n={1}
            name={file ? "Load the file" : "Load the full page"}
            hint={file ? "Read the file as text." : "Open the page in a real browser, run its scripts, and convert it to Markdown."}
            detail={run.full ? `${num(run.full.markdown.tokens)} tokens` : undefined}
            state={stepState(run.full, running, failed)}
            startedAt={run.startedAt}
            ms={run.full?.ms}
            cached={run.full?.cached}
          />
          <StepRow
            n={2}
            name="Find the main content"
            hint={file ? "Skip this step. A file has no menus or footer." : "Separate the page's own text from its menus, sidebars and footer."}
            state={file && run.main ? "skipped" : mainMissing ? (fixtures ? "unsaved" : "failed") : stepState(run.main, running, failed)}
            startedAt={run.startedAt}
            ms={run.main?.ms}
            cached={run.main?.cached}
          />
          <StepRow
            n={3}
            name="Look for a published Markdown version"
            hint={file ? "Skip this step. A file is already plain text." : "Follow the page's own link to a Markdown version, if it has one."}
            detail={
              published?.status === "offered" && published.tokens !== undefined
                ? `${num(published.tokens)} tokens`
                : published?.status === "not_offered"
                  ? "none"
                  : undefined
            }
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
            cached={run.published?.cached}
          />
          <StepRow
            n={4}
            name={file ? "Count the tokens" : "Match and count the tokens"}
            hint={file ? "Count every token in the file." : "Match the main content to the full page, line by line, then count every token."}
            state={result ? "done" : failed ? "failed" : run.full ? "live" : "waiting"}
            startedAt={run.startedAt}
            // The server's own time, like the steps above. Without it, the time this browser waited.
            ms={result?.steps?.total ?? (run.finishedAt && run.finishedAt > run.startedAt ? run.finishedAt - run.startedAt : undefined)}
          />
        </Section>


        {/* When it was measured, the two sizes and the tokenizer. Room for the buttons, so the cards below barely move when the values arrive. */}
        <div className="mt-4 min-h-12 border-t border-line pt-3 font-mono text-[11px] leading-4 text-faint">
          {result ? (
            <div className="fade">
              <div className="flex items-center justify-between gap-3">
                <p>Measured on {measuredAt(result.measuredAt)}</p>
                <ResultActions id={result.id} title={shareText({ kind: "page", result }).title} onMeasureAgain={run.saved ? onMeasureAgain : undefined} />
              </div>
              {result.html.tokens > 0 && <p className="truncate">Full page code (HTML): {num(result.html.tokens)} tokens</p>}
              <p className="truncate">Clean text code (Markdown): {num(result.markdown.tokens)} tokens</p>
              <p>Tokens counted with OpenAI&apos;s o200k tokenizer.</p>
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
