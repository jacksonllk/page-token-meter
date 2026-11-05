import { ImageResponse } from "next/og";
import { HomeCard, OG_FONTS, SiteCard } from "@/app/og/cards";
import { latestSite } from "@/lib/results";
import { websiteFrom } from "@/lib/keypages";
import { fetchImage } from "@/lib/plain-fetch";
import { getStore } from "@/lib/store";

export const alt = "A Page Token Meter result: how many tokens AI agents need to read it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The newest saved result for the website, or the home card when there is none yet. Never runs a live check.
export default async function Image({ params }: { params: Promise<{ domain: string }> }) {
  const domain = websiteFrom((await params).domain);
  const result = domain ? await latestSite(getStore(), domain).catch(() => null) : null;
  const logo = result?.logo ? await fetchImage(result.logo) : null;
  const card = result ? <SiteCard r={result} logo={logo} /> : <HomeCard />;
  return new ImageResponse(card, { ...size, fonts: OG_FONTS });
}
