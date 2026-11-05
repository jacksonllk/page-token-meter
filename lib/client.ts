import ContextDev from "context.dev";
import { fixtureClient } from "./fixture-client";
import { pageExists, plainFetch, type TextFetch } from "./plain-fetch";

// Kill switch: set LIVE_CHECKS=off to stop every live context.dev call at once.
export const liveChecksOff = () => process.env.LIVE_CHECKS === "off";

// Returns null when no key is set, so callers can show a clear message.
export function getClient() {
  // `npm run dev:fixtures`: serve saved responses, never call the live API.
  if (process.env.PTM_FIXTURES === "1") return fixtureClient();
  const apiKey = process.env.CONTEXT_DEV_API_KEY;
  if (!apiKey) return null;
  // One retry at most: each retry can spend a credit.
  return new ContextDev({ apiKey, maxRetries: 1 });
}

// Direct downloads of llms.txt and published Markdown. Off in fixture mode, which never touches the network.
export function getTextFetch(): TextFetch | undefined {
  return process.env.PTM_FIXTURES === "1" ? undefined : plainFetch;
}

// Direct checks that a page Map missed is there (/pricing). Off in fixture mode too.
export function getPageCheck(): ((url: string) => Promise<boolean>) | undefined {
  return process.env.PTM_FIXTURES === "1" ? undefined : pageExists;
}
