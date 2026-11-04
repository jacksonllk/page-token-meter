import { clientIp, handleMeasure } from "@/lib/api";
import { getClient, getTextFetch, liveChecksOff } from "@/lib/client";
import { getStore } from "@/lib/store";

// 3 scrapes can take a while on heavy pages.
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleMeasure(request, getClient(), { store: getStore(), ip: clientIp(request), liveOff: liveChecksOff(), fetchText: getTextFetch() });
}
