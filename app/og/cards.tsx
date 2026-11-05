import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { num, pct } from "@/lib/format";
import { HEAT_COLS, HEAT_LEVELS, HEAT_ROWS, heatFromBreakdown } from "@/lib/heat";
import type { Measurement } from "@/lib/measure";
import { shortUrl } from "@/lib/share-text";
import type { SiteResult } from "@/lib/site";

// Preview images (Open Graph cards) for links shared on X, Slack and the like. Drawn with next/og, which supports flexbox only.
// Rules: clear at a glance, light theme, no text under 28px (cards show at about 40% size in feeds), no addresses or dates.
// Fonts: Geist and Geist Mono (SIL Open Font License, see fonts/OFL.txt), read once when the module loads.

const root = process.cwd();
const [regular, semibold, mono, logo, product] = await Promise.all([
  readFile(join(root, "app/og/fonts/Geist-Regular.ttf")),
  readFile(join(root, "app/og/fonts/Geist-SemiBold.ttf")),
  readFile(join(root, "app/og/fonts/GeistMono-Medium.ttf")),
  readFile(join(root, "app/apple-icon.png")),
  // The top of the docs.context.dev page result in the app, 2x, from a live fresh capture on 5 Nov 2026 (2,714 tokens).
  // Retake it from a live run when the result layout changes. Never with fixture times: fixture mode makes them up.
  readFile(join(root, "app/og/product.png")),
]);

export const OG_FONTS = [
  { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
  { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
  { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
];

const LOGO = `data:image/png;base64,${logo.toString("base64")}`;
const PRODUCT = `data:image/png;base64,${product.toString("base64")}`;

const C = {
  bg: "#ffffff",
  fg: "#0b0f19",
  muted: "#5b6475",
  track: "#e8ebf2",
  accent: "#2663eb",
  accentDark: "#1d4ed8",
  accentSoft: "#eaf0ff",
  line: "#e3e7ef",
};

// The brand and the card's content. Nothing else.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px 72px 64px", background: C.bg, color: C.fg, fontFamily: "Geist" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
        <img src={LOGO} width={48} height={48} style={{ borderRadius: 12 }} alt="" />
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>Page Token Meter</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
    </div>
  );
}

// A Whole website result. The point: how many tokens its key pages take, and what those pages are.
// Pages stay in the website's own order, not ranked by size: a long page is not a problem to point at.
// logo: the website's logo as a data URL (lib/plain-fetch.ts fetchImage), or null to draw the card without it.
export function SiteCard({ r, logo = null }: { r: SiteResult; logo?: string | null }) {
  const pages = r.pages.filter((p) => !p.file && p.markdown);
  const shown = pages.slice(0, 5);
  const max = Math.max(1, ...shown.map((p) => p.markdown!.tokens));
  const more = pages.length - shown.length;
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 46, fontWeight: 600 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
            {logo && <img src={logo} width={52} height={52} style={{ borderRadius: 12 }} alt="" />}
            {r.domain}
          </div>
          <div style={{ display: "flex", marginTop: 2, fontFamily: "Geist Mono", fontSize: 140, color: C.fg, letterSpacing: -8, lineHeight: 1 }}>
            {num(r.totalMarkdownTokens)}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 32, color: C.muted }}>tokens for an AI agent to read its key pages</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
          <div style={{ display: "flex", fontSize: 28, color: C.muted }}>{pages.length} key pages</div>
          {shown.map((p) => (
            <Bar key={p.url} name={p.role} tokens={p.markdown!.tokens} max={max} />
          ))}
          {more > 0 && <div style={{ display: "flex", fontSize: 28, color: C.muted }}>and {more} more</div>}
        </div>
      </div>
    </Frame>
  );
}

function Bar({ name, tokens, max, size = 30 }: { name: string; tokens: number; max: number; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div style={{ display: "block", flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: size }}>{name}</div>
        <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 28, color: C.muted }}>{num(tokens)}</div>
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, background: C.track }}>
        <div style={{ display: "flex", width: pct(tokens / max), height: 12, borderRadius: 6, background: C.accent }} />
      </div>
    </div>
  );
}

// A One page result. The point: how many tokens the page takes, and where its main content sits, as the heatmap with its key.
// Not a judgement: the parts around the content are there for people.
export function PageCard({ m, logo = null }: { m: Measurement; logo?: string | null }) {
  const b = m.breakdown;
  const heat = m.heat ?? (b ? heatFromBreakdown(b) : null);
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
            {logo && <img src={logo} width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} alt="" />}
            <div style={{ display: "block", fontSize: 40, color: C.muted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{shortUrl(m.url)}</div>
          </div>
          <div style={{ display: "flex", marginTop: 4, fontFamily: "Geist Mono", fontSize: 140, color: C.fg, letterSpacing: -8, lineHeight: 1 }}>{num(m.markdown.tokens)}</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 36, color: C.muted }}>tokens to read this page</div>
          {heat && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 44, gap: 14, fontSize: 28, color: C.muted }}>
              {/* The heatmap's key, as under the heatmap in the app. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                Less content
                {HEAT_SHADES.map((shade) => (
                  <div key={shade} style={{ display: "flex", width: 24, height: 24, borderRadius: 5, background: shade }} />
                ))}
                More content
              </div>
              <div style={{ display: "flex" }}>The page&apos;s text in the order an agent reads it.</div>
            </div>
          )}
        </div>
        {heat && <HeatGrid heat={heat} />}
      </div>
    </Frame>
  );
}

// The page heatmap (lib/heat.ts), as on the result: read like text, darker blocks hold more main content.
const HEAT_SHADES = [C.track, "#d4e0fb", "#b3c8f8", "#88a9f4", "#5182ef", C.accent];
function HeatGrid({ heat }: { heat: number[] }) {
  const rows = Array.from({ length: HEAT_ROWS }, (_, r) => heat.slice(r * HEAT_COLS, (r + 1) * HEAT_COLS));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 20, border: `2px solid ${C.line}` }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 4 }}>
          {row.map((level, c) => (
            <div key={c} style={{ display: "flex", width: 21, height: 21, borderRadius: 4, background: HEAT_SHADES[Math.max(0, Math.min(HEAT_LEVELS, level))] }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// The app's own card: the home page link, and the GitHub social preview (1280×640, uploaded by hand).
// Logo and name, the headline, the subline and the three promises, next to a screenshot of a page result.
// shot: the screenshot's size. Both sizes keep the same text column and leave the screenshot 36 px from the right edge,
// running off the bottom: 560 wide on the 1200 card, 640 on the 1280 GitHub card. product.png is 1280×1360 (640×680 at 2x).
export function HomeCard({ shot = { width: 560, height: 595 } }: { shot?: { width: number; height: number } }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, color: C.fg, fontFamily: "Geist", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 580, flexShrink: 0, padding: "56px 0 64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
          <img src={LOGO} width={48} height={48} style={{ borderRadius: 12 }} alt="" />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>Page Token Meter</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.08 }}>See your website as AI agents see it</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: C.muted, lineHeight: 1.3 }}>
            Scan a URL to see the content AI agents get from your key pages and for how many tokens.
          </div>
          <div style={{ display: "flex", marginTop: 30, gap: 20, fontSize: 28 }}>
            {["Free", "No key needed", "Open source"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: C.accent }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "72px 0 0 24px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
        <img
          src={PRODUCT}
          width={shot.width}
          height={shot.height}
          style={{ borderRadius: 20, border: `2px solid ${C.line}`, boxShadow: "0 24px 60px rgba(11,15,25,0.12)" }}
          alt=""
        />
      </div>
    </div>
  );
}
