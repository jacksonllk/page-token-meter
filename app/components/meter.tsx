"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CHIPS } from "@/lib/chips";
import { websiteFrom } from "@/lib/keypages";
import type { PageStreamEvent, SiteStreamEvent } from "@/lib/events";
import { contextDevLink, REPO_URL } from "@/lib/links";
import { ArrowRight, CheckIcon, GlobeIcon } from "./icons";
import { PagePanel } from "./page-panel";
import { applyPageEvent, applySiteEvent, readEvents, type ApiError, type PageRun, type SiteRun } from "./runs";
import { SitePanel } from "./site-panel";

// Shown when a visitor has used their free checks (VISITOR_LIMIT), the whole site's daily cap is reached (DAILY_CAP),
// or new checks are paused (DEMO_LIMIT: LIVE_CHECKS=off or context.dev out of credits).
// Never says what the limits are or when they reset.
const HEADING: Record<string, string> = {
  VISITOR_LIMIT: "You've used your free checks for now.",
  DAILY_CAP: "Today's free checks are used up.",
  DEMO_LIMIT: "New checks are paused for now.",
};

function LimitReached({ code }: { code: string }) {
  return (
    <div className="appear rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <p className="font-medium">{HEADING[code] ?? HEADING.DEMO_LIMIT}</p>
      <p className="mt-1 text-sm text-muted">Try again later. Saved results still work.</p>
      <p className="mt-4 text-sm">Or run Page Token Meter yourself with your own free context.dev key.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <a
          href={contextDevLink("demo_limit")}
          className="inline-flex flex-col rounded-xl bg-accent px-4 py-2 text-sm leading-tight font-medium text-white transition hover:brightness-110"
        >
          Get a free context.dev key
          <span className="text-[11px] font-normal text-white/75">1,000 credits a month</span>
        </a>
        <a href={`${REPO_URL}#run-locally`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
          How to run it yourself <ArrowRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: ApiError }) {
  if (error.code in HEADING) return <LimitReached code={error.code} />;
  return <p className="appear rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error.error}</p>;
}

type Mode = "page" | "site";

// Under every result: who powers it, and one way to start. The steps in each result already say how it was made.
export function PoweredBy() {
  return (
    <section className="appear flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 sm:px-5">
      <p className="flex items-center gap-2 text-sm text-muted">
        Powered by
        <Image src="/context-dev.png" alt="" width={16} height={16} className="size-4 rounded-[4px]" />
        <span className="-ml-0.5 font-medium text-fg">context.dev</span>
      </p>
      <a
        href={contextDevLink("result_card")}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
      >
        Start for free <ArrowRight className="size-3" />
      </a>
    </section>
  );
}

// The address bar always shows what is on screen: "/stripe.com" for a Whole website result, "/" otherwise.
// That address is the link people copy and type. Replacing it does not reload the page.
function showInAddressBar(path: string) {
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
}

// fixtures: the app runs on saved responses (npm run dev:fixtures). Some answers were never saved.
// initialDomain: opened as "/stripe.com", so that website is measured at once.
export function Meter({ fixtures = false, initialDomain }: { fixtures?: boolean; initialDomain?: string }) {
  // Whole site is the main view. One page is one tap away.
  const [mode, setMode] = useState<Mode>("site");
  const [input, setInput] = useState(initialDomain ?? "");
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

  // Opened as "/stripe.com": measure it once, as if the visitor had typed it.
  const started = useRef(false);
  useEffect(() => {
    if (!initialDomain || started.current) return;
    started.current = true;
    runSite(initialDomain);
  }, [initialDomain]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || running) return;
    setPage(null);
    setSite(null);
    setDrilled(false);
    setSlide(null);
    if (mode === "page") {
      showInAddressBar("/");
      runPage(value);
    } else {
      const domain = websiteFrom(value);
      if (domain) showInAddressBar(`/${domain}`);
      runSite(value);
    }
  }

  // A try chip: measure that website. Its saved result comes back at once, with 0 credits.
  function tryChip(e: React.MouseEvent<HTMLButtonElement>) {
    const domain = e.currentTarget.value;
    if (running) return;
    setPage(null);
    setSite(null);
    setDrilled(false);
    setSlide(null);
    setMode("site");
    setInput(domain);
    showInAddressBar(`/${domain}`);
    runSite(domain);
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
  const isLimit = (e?: ApiError) => Boolean(e && e.code in HEADING);
  const limited = isLimit(site?.error) || isLimit(page?.error);

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
                {m === "page" ? "One page" : "Whole website"}
              </button>
            ))}
          </div>
          <span className="hidden pr-2 font-mono text-[11px] text-faint sm:block">{mode === "site" ? "key pages" : "one page in depth"}</span>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="url" className="flex min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-xl bg-bg px-3.5">
            <GlobeIcon className="size-4 text-faint" />
            <span className="sr-only">{mode === "page" ? "Page URL" : "Website address"}</span>
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
                {mode === "page" ? "Measure page" : "Measure website"} <ArrowRight />
              </>
            )}
          </button>
        </div>
      </form>

      {/* <p className="mt-3 px-1 text-sm text-muted">
        {mode === "page" ? "Measure one page: its tokens and where they go." : "Measure your key pages: the ones your llms.txt lists, or pricing, docs, API reference and more."}
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

      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs text-faint">Try</span>
        {CHIPS.map((domain) => (
          <button
            key={domain}
            type="button"
            value={domain}
            disabled={running}
            onClick={tryChip}
            className="rounded-full border border-line bg-panel px-2.5 py-0.5 font-mono text-[11px] text-muted transition hover:border-faint hover:text-fg disabled:opacity-50"
          >
            {domain}
          </button>
        ))}
      </div>

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
          {/* The limit message already offers a context.dev key: no second offer below it. */}
          {hasRun && !limited && <PoweredBy />}
        </div>
      </div>
    </div>
  );
}
