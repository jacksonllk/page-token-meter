import { clientIp, handleSite } from "@/lib/api";
import { getClient, getPageCheck, getTextFetch, liveChecksOff } from "@/lib/client";
import { getStore } from "@/lib/store";

// 1 Map call plus 1 scrape per key page (8 unless MAX_KEY_PAGES is set), 2 at a time.
export const maxDuration = 120;

export async function GET(request: Request) {
  return handleSite(request, getClient(), { store: getStore(), ip: clientIp(request), liveOff: liveChecksOff(), fetchText: getTextFetch(), pageExists: getPageCheck() });
}
