"use client";

import Link from "next/link";
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
        <SitePanel run={savedSiteRun({ domain: shared.result.domain, startedAt: 0 }, shared.result)} />
      )}
      <Link
        href="/"
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-white transition hover:brightness-110"
      >
        Measure your own site <ArrowRight />
      </Link>
      <PoweredBy />
    </div>
  );
}
