import { ImageResponse } from "next/og";
import { HomeCard, OG_FONTS } from "./og/cards";

export const alt = "Page Token Meter: see your website as AI agents see it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<HomeCard />, { ...size, fonts: OG_FONTS });
}
