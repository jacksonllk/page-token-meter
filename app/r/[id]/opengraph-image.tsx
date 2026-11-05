import { ImageResponse } from "next/og";
import { HomeCard, OG_FONTS, PageCard, SiteCard } from "@/app/og/cards";
import { fetchImage } from "@/lib/plain-fetch";
import { sharedResult } from "@/lib/results";
import { getStore } from "@/lib/store";

export const alt = "A Page Token Meter result: how many tokens AI agents need to read it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const shared = await sharedResult(getStore(), (await params).id);
  const logo = shared?.result.logo ? await fetchImage(shared.result.logo) : null;
  const card = !shared ? <HomeCard /> : shared.kind === "site" ? <SiteCard r={shared.result} logo={logo} /> : <PageCard m={shared.result} logo={logo} />;
  return new ImageResponse(card, { ...size, fonts: OG_FONTS });
}
