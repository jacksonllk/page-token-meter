"use client";

import Link from "next/link";
import { useState } from "react";
import type { PageStreamEvent } from "@/lib/events";
import { measuredAt } from "@/lib/format";
import type { Shared } from "@/lib/results";
import { ArrowRight } from "./icons";
import { ErrorBox, PoweredBy } from "./meter";
import { PagePanel } from "./page-panel";
import { applyPageEvent, readEvents, savedPageRun, savedSiteRun, type PageRun } from "./runs";
import { SitePanel } from "./site-panel";

// A result opened from a share link: the saved numbers, then a way to measure your own site.
// A page result can load its text on the spot: a normal check of that page, shown in place of the snapshot.
export function SharedView({ shared }: { shared: Shared }) {
  const [live, setLive] = useState<PageRun | null>(null);
  async function loadText(url: string) {
    setLive({ url, startedAt: Date.now() });
    const failed = await readEvents<PageStreamEvent>(`/api/page/stream?url=${encodeURIComponent(url)}`, (ev) => setLive((run) => (run ? applyPageEvent(run, ev) : run)));
    if (failed) setLive((run) => (run ? { ...run, error: failed, finishedAt: Date.now() } : run));
  }
  return (
    <div className="space-y-4">
      {shared.kind === "page" && live && !live.error ? (
        <PagePanel run={live} />
      ) : shared.kind === "page" ? (
        <>
          {/* If loading failed (for example the daily limit), the snapshot stays, with the reason above it. */}
          {live?.error && <ErrorBox error={live.error} />}
          <PagePanel run={savedPageRun({ url: shared.result.url, startedAt: 0 }, shared.result)} shared onLoadText={() => loadText(shared.result.url)} />
        </>
      ) : (
        <SitePanel run={savedSiteRun({ domain: shared.result.domain, startedAt: 0 }, shared.result)} shared />
      )}
      {/* A share link keeps the result as it was. A website's own address always shows its newest result. */}
      {shared.kind === "site" && (
        <p className="px-1 text-sm text-muted">
          This is the result from {measuredAt(shared.result.measuredAt, "UTC")}.{" "}
          <Link href={`/${shared.result.domain}`} className="font-medium text-accent-fg hover:underline">
            See {shared.result.domain}&apos;s newest result
          </Link>
        </p>
      )}
      <Link
        href="/"
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-white transition hover:brightness-110"
      >
        Measure your own website <ArrowRight />
      </Link>
      <PoweredBy />
    </div>
  );
}
