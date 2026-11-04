import { ImageResponse } from "next/og";
import { measuredAt, num, pct } from "@/lib/format";
import { sharedResult } from "@/lib/results";
import { shareText } from "@/lib/share-text";
import { getStore } from "@/lib/store";

export const alt = "Page Token Meter result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2663eb";
const FG = "#0b0f19";
const MUTED = "#5b6475";
const TRACK = "#e7eaf0";

// The share card: the token count first, then what was measured. A site also shows its heaviest pages as bars.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const shared = await sharedResult(getStore(), (await params).id);
  if (!shared) {
    return new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "white", fontSize: 56, color: FG }}>
        Page Token Meter
      </div>,
      size,
    );
  }

  const { tokens, target } = shareText(shared);
  const pages =
    shared.kind === "site"
      ? shared.result.pages
          .filter((p) => !p.file && p.markdown)
          .sort((a, b) => b.markdown!.tokens - a.markdown!.tokens)
          .slice(0, 3)
      : [];
  const total = shared.kind === "site" ? shared.result.totalMarkdownTokens : 0;

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 72, background: "white", color: FG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
        <div style={{ display: "flex", width: 28, height: 28, borderRadius: 8, background: ACCENT }} />
        Page Token Meter
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: pages.length ? 40 : 56 }}>
        <div style={{ display: "flex", fontSize: pages.length ? 120 : 150, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>{num(tokens)}</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 36, color: MUTED }}>OpenAI o200k tokens to read {target}</div>
      </div>

      {pages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
          {pages.map((p) => (
            <div key={p.url} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 22, color: MUTED }}>
              <div style={{ display: "block", width: 260, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{p.role}</div>
              <div style={{ display: "flex", flex: 1, height: 12, borderRadius: 6, background: TRACK }}>
                <div style={{ display: "flex", width: pct(p.markdown!.tokens / Math.max(1, total)), height: 12, borderRadius: 6, background: ACCENT }} />
              </div>
              <div style={{ display: "flex", width: 110, justifyContent: "flex-end" }}>{num(p.markdown!.tokens)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", fontSize: 22, color: MUTED }}>
        <div style={{ display: "flex" }}>Measured {measuredAt(shared.result.measuredAt)}</div>
        <div style={{ display: "flex" }}>Powered by context.dev</div>
      </div>
    </div>,
    size,
  );
}
