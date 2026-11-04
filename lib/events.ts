// Live progress events sent from the server to the page, one JSON object per line.
// Every event reports a real step that just finished. Nothing here is simulated.
import type { KeyPage } from "./keypages";
import type { DeclaredLinks, Measurement, TextSize } from "./measure";
import type { PageSource, SiteResult } from "./site";

export type MeasureEvent =
  | { type: "full"; ms: number; markdown: TextSize; html: TextSize; links: DeclaredLinks }
  | { type: "main"; ms: number; mainContent: TextSize | null }
  | { type: "published"; ms: number; published: Measurement["published"] };

export type SiteEvent =
  | { type: "map"; ms: number; urlCount: number }
  | { type: "llms"; ms: number; url: string | null }
  | { type: "picked"; ms: number; pages: KeyPage[]; source: PageSource }
  | { type: "page-start"; ms: number; index: number }
  | { type: "page"; ms: number; index: number; markdown: TextSize | null; error?: string };

export type StreamEnd<T> = { type: "done"; result: T } | { type: "error"; error: string; code: string };

export type PageStreamEvent = MeasureEvent | StreamEnd<Measurement>;
export type SiteStreamEvent = SiteEvent | StreamEnd<SiteResult>;
