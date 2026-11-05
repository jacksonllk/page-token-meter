// Live progress events sent from the server to the page, one JSON object per line.
// Every event reports a real step that just finished. Nothing here is simulated.
// cached: context.dev answered with a copy it had already made (cache_metadata "hit"), so the time is not a fresh load.
import type { KeyPage } from "./keypages";
import type { DeclaredLinks, Measurement, TextSize } from "./measure";
import type { PageSource, SiteResult } from "./site";

export type MeasureEvent =
  | { type: "full"; ms: number; markdown: TextSize; html: TextSize; links: DeclaredLinks; cached?: boolean }
  | { type: "main"; ms: number; mainContent: TextSize | null; cached?: boolean }
  | { type: "published"; ms: number; published: Measurement["published"]; cached?: boolean };

export type SiteEvent =
  | { type: "map"; ms: number; urlCount: number }
  | { type: "llms"; ms: number; url: string | null }
  | { type: "picked"; ms: number; pages: KeyPage[]; source: PageSource; max: number }
  | { type: "page-start"; ms: number; index: number }
  | { type: "page"; ms: number; index: number; markdown: TextSize | null; error?: string; cached?: boolean };

export type StreamEnd<T> = { type: "done"; result: T } | { type: "error"; error: string; code: string };

export type PageStreamEvent = MeasureEvent | StreamEnd<Measurement>;
export type SiteStreamEvent = SiteEvent | StreamEnd<SiteResult>;
