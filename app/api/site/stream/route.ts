import { clientIp, handleSiteStream } from "@/lib/api";
import { getClient, getTextFetch, liveChecksOff } from "@/lib/client";
import { getStore } from "@/lib/store";

export const maxDuration = 120;

// Used by the website: sends each step as it finishes.
export async function GET(request: Request) {
  return handleSiteStream(request, getClient(), { store: getStore(), ip: clientIp(request), liveOff: liveChecksOff(), fetchText: getTextFetch() });
}
