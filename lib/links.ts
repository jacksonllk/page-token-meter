// Tagged links to context.dev, so it can see which visits came from this app. Never add the measured domain: it is the visitor's data.
export type LinkSpot = "result_card" | "demo_limit" | "readme" | "footer";

export function contextDevLink(spot: LinkSpot): string {
  return `https://context.dev/?utm_source=page-token-meter&utm_medium=${spot}&utm_campaign=open-source`;
}

export const REPO_URL = "https://github.com/jacksonllk/page-token-meter";
