"use client";

import Image from "next/image";
import { useState } from "react";
import type { PageStreamEvent, SiteStreamEvent } from "@/lib/events";
import { contextDevLink, REPO_URL } from "@/lib/links";
import { ArrowRight, CheckIcon, GlobeIcon } from "./icons";
import { PagePanel } from "./page-panel";
import { applyPageEvent, applySiteEvent, readEvents, type ApiError, type PageRun, type SiteRun } from "./runs";
import { SitePanel } from "./site-panel";

// Shown when a visitor or the whole site has used up today's credits, or live checks are off. The message comes from the API.
function LimitReached({ message }: { message: string }) {
  return (
    <div className="appear rounded-2xl border border-line bg-panel p-4 text-sm sm:p-5">
      <p>{message}</p>
      <p className="mt-2">
        <a className="text-accent-fg underline underline-offset-2" href={contextDevLink("demo_limit")}>
          Create a free context.dev account
        </a>{" "}
        (1,000 credits a month), then:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-code p-3 font-mono text-xs text-muted">
        {`git clone ${REPO_URL}\ncp .env.example .env   # add your key\nnpm install && npm run dev`}
      </pre>
    </div>
  );
}

function ErrorBox({ error }: { error: ApiError }) {
  if (error.code === "DEMO_LIMIT" || error.code === "VISITOR_LIMIT") return <LimitReached message={error.error} />;
  return <p className="appear rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error.error}</p>;
}

type Mode = "page" | "site";

// How a result is made, under every result. Voice and facts follow context.dev's home and pricing pages (3 Nov 2026).
const HOW_IT_WORKS = [
  {
    title: "Map out key pages",
    text: "Pick up to 8 key pages from your llms.txt. If you don't have one, we will pick key pages like pricing, docs and API reference.",
  },
  {
    title: "Load each page",
    text: "Opens each page in a real browser and turns it into markdown, returning the full page and the main content.",
  },
  {
    title: "Count page tokens",
    text: "Tokens are counted with OpenAI's o200k tokenizer, used by GPT-4o, GPT-4.1 and GPT-5. Other models count differently.",
  },
];

export function PoweredBy() {
  return (
    <section className="appear rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <p className="flex items-center gap-2 text-xs text-muted">
        Powered by
        <Image src="/context-dev.png" alt="" width={16} height={16} className="size-4 rounded-[4px]" />
        <span className="-ml-0.5 font-medium text-fg">context.dev</span>
      </p>
      <h2 className="mt-2 text-base font-semibold">Every key page, fully loaded and counted.</h2>
      <ol className="mt-4 space-y-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[11px] text-muted">
              {i + 1}
            </span>
            <p className="text-sm text-muted">
              <span className="font-medium text-fg">{step.title}.</span> {step.text}
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap justify-center items-center gap-x-5 gap-y-3 border-t border-line pt-4">
        <a
          href={contextDevLink("result_card")}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          Start for free on context.dev <ArrowRight className="size-3.5" />
        </a>
      </div>
      <p className="mt-2.5 text-xs text-faint text-center">1,000 free credits a month. No card required.</p>
    </section>
  );
}

// fixtures: the app runs on saved responses (npm run dev:fixtures). Some answers were never saved.
export function Meter({ fixtures = false }: { fixtures?: boolean }) {
  // Whole site is the main view. One page is one tap away.
  const [mode, setMode] = useState<Mode>("site");
  const [input, setInput] = useState("");
  const [page, setPage] = useState<PageRun | null>(null);
  const [site, setSite] = useState<SiteRun | null>(null);
  // True while looking at one page opened from the site result. The site result stays in memory for "Back".
  const [drilled, setDrilled] = useState(false);
  // Which way the results slide in after "open page" or "Back". The counter restarts the animation.
  const [slide, setSlide] = useState<{ from: "left" | "right"; n: number } | null>(null);
  const pageRunning = Boolean(page && page.finishedAt === undefined);
  const siteRunning = Boolean(site && site.finishedAt === undefined);
  const running = pageRunning || siteRunning;

  // fresh: skip the 24-hour cache ("Measure again").
  async function runPage(url: string, fresh = false) {
    setPage({ url, startedAt: Date.now() });
    const failed = await readEvents<PageStreamEvent>(`/api/measure/stream?url=${encodeURIComponent(url)}${fresh ? "&fresh=1" : ""}`, (ev) =>
      setPage((run) => (run ? applyPageEvent(run, ev) : run)),
    );
    if (failed) setPage((run) => (run ? { ...run, error: failed, finishedAt: Date.now() } : run));
  }

  async function runSite(domain: string, fresh = false) {
    setSite({ domain, startedAt: Date.now() });
    const failed = await readEvents<SiteStreamEvent>(`/api/site/stream?domain=${encodeURIComponent(domain)}${fresh ? "&fresh=1" : ""}`, (ev) =>
      setSite((run) => (run ? applySiteEvent(run, ev) : run)),
    );
    if (failed) setSite((run) => (run ? { ...run, error: failed, finishedAt: Date.now() } : run));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || running) return;
    setPage(null);
    setSite(null);
    setDrilled(false);
    setSlide(null);
    if (mode === "page") runPage(value);
    else runSite(value);
  }

  const scrollToResults = () =>
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  // In the Site view, a tapped page opens in the one-page view. "Back" returns to the site result.
  function openPage(url: string) {
    if (pageRunning) return;
    setDrilled(true);
    setSlide((s) => ({ from: "right", n: (s?.n ?? 0) + 1 }));
    setMode("page");
    setInput(url);
    runPage(url);
    scrollToResults();
  }

  function backToSite() {
    if (!site) return;
    setDrilled(false);
    setPage(null);
    setSlide((s) => ({ from: "left", n: (s?.n ?? 0) + 1 }));
    setMode("site");
    setInput(site.domain);
    scrollToResults();
  }

  const hasRun = Boolean(site || page);

  return (
    <div className="w-full">
      {/* The command bar: mode switch, address and button in one card. */}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-line bg-panel p-2 transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent-soft"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Whole site on the left, One page on the right. The blue pill slides between them. */}
          <div role="tablist" aria-label="What to measure" className="relative grid w-56 grid-cols-2 rounded-xl bg-track/60 p-1">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-panel ring-1 ring-line transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: mode === "page" ? "translateX(100%)" : "none" }}
            />
            {(["site", "page"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setDrilled(false);
                }}
                className={`relative rounded-lg py-1.5 text-[13px] font-medium transition-colors duration-300 ${mode === m ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                {m === "page" ? "One page" : "Whole site"}
              </button>
            ))}
          </div>
          <span className="hidden pr-2 font-mono text-[11px] text-faint sm:block">{mode === "site" ? "up to 8 key pages" : "one page in depth"}</span>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="url" className="flex min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-xl bg-bg px-3.5">
            <GlobeIcon className="size-4 text-faint" />
            <span className="sr-only">{mode === "page" ? "Page URL" : "Site address"}</span>
            <input
              id="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder={mode === "page" ? "docs.example.com/getting-started" : "example.com"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-11 w-full min-w-0 bg-transparent font-mono text-[15px] text-fg outline-none placeholder:text-faint"
            />
          </label>
          <button
            type="submit"
            disabled={running}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-60"
          >
            {running ? (
              <>
                <span className="live-dot">●</span> Measuring
              </>
            ) : (
              <>
                {mode === "page" ? "Measure page" : "Measure site"} <ArrowRight />
              </>
            )}
          </button>
        </div>
      </form>

      {/* <p className="mt-3 px-1 text-sm text-muted">
        {mode === "page" ? "Measure one page: its tokens and where they go." : "Measure up to 8 key pages: the ones your llms.txt lists, or pricing, docs, API reference and more."}
      </p> */}
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted">
        {["Free", "No key needed", "Open source"].map((item) => (
          <li key={item} className="flex items-center gap-1.5">
            <CheckIcon className="size-3.5 text-accent-fg" />
            {item}
          </li>
        ))}
        <li>
          <a href={contextDevLink("footer")} className="flex items-center gap-1.5 hover:text-fg">
            <Image src="/context-dev.png" alt="" width={14} height={14} className="size-3.5 rounded-[3px]" />
            Powered by context.dev
          </a>
        </li>
      </ul>

      <div id="results" className="mt-6 scroll-mt-4 overflow-x-clip">
        <div key={slide?.n ?? 0} className={`space-y-4 ${slide ? `slide-from-${slide.from}` : ""}`}>
          {drilled && site && (
            <button onClick={backToSite} className="text-sm font-medium text-accent-fg hover:underline">
              ← Back
            </button>
          )}
          {!drilled && site?.error && <ErrorBox error={site.error} />}
          {!drilled && site && !site.error && (
            <SitePanel run={site} onOpenPage={site.result ? openPage : undefined} onMeasureAgain={() => !running && runSite(site.domain, true)} />
          )}
          {page?.error && <ErrorBox error={page.error} />}
          {page && !page.error && <PagePanel run={page} fixtures={fixtures} onMeasureAgain={() => !running && runPage(page.url, true)} />}
          {hasRun && <PoweredBy />}
        </div>
      </div>
    </div>
  );
}
