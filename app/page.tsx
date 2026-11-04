import { Meter } from "./components/meter";
import { SiteFooter, SiteHeader } from "./components/site-chrome";
import { TokenField } from "./components/token-field";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10">
      {process.env.PTM_FIXTURES === "1" && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-700 dark:text-amber-300">
          Fixture mode: saved responses and simulated timings. No credits used.
        </p>
      )}

      <SiteHeader />

      <section className="relative pt-5 sm:pt-8">
        <TokenField />
        <div className="relative">
          <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-6xl">Your site&apos;s token budget</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            Paste a URL. See how many tokens an AI agent needs to read your key pages.
          </p>
        </div>
      </section>

      <div className="relative mt-8">
        <Meter fixtures={process.env.PTM_FIXTURES === "1"} />
      </div>

      <SiteFooter />
    </main>
  );
}
