"use client";

import Link from "next/link";
import { measuredAt } from "@/lib/format";
import type { Shared } from "@/lib/results";
import { ArrowRight } from "./icons";
import { PoweredBy } from "./meter";
import { PagePanel } from "./page-panel";
import { savedPageRun, savedSiteRun } from "./runs";
import { SitePanel } from "./site-panel";

// A result opened from a share link: the saved numbers, then a way to measure your own site.
export function SharedView({ shared }: { shared: Shared }) {
  return (
    <div className="space-y-4">
      {shared.kind === "page" ? (
        <PagePanel run={savedPageRun({ url: shared.result.url, startedAt: 0 }, shared.result)} shared />
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
