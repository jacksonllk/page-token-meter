import { ImageResponse } from "next/og";
import { HomeCard, OG_FONTS } from "../cards";

// GET /og/github: the GitHub social preview (1280×640), the home card at GitHub's size. Download it and upload it in the repo's settings.
export function GET() {
  return new ImageResponse(<HomeCard shot={{ width: 640, height: 680 }} />, { width: 1280, height: 640, fonts: OG_FONTS });
}
