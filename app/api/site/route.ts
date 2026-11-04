import { clientIp, handleSite } from "@/lib/api";
import { getClient, getTextFetch, liveChecksOff } from "@/lib/client";
import { getStore } from "@/lib/store";

// 1 Map call plus up to 8 scrapes, 2 at a time.
export const maxDuration = 120;

export async function GET(request: Request) {
  return handleSite(request, getClient(), { store: getStore(), ip: clientIp(request), liveOff: liveChecksOff(), fetchText: getTextFetch() });
}
