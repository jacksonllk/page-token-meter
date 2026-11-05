// Tagged links to context.dev, so it can see which visits came from this app. Never add the measured domain: it is the visitor's data.
export type LinkSpot = "result_card" | "demo_limit" | "readme" | "footer";

export function contextDevLink(spot: LinkSpot): string {
  return `https://context.dev/?utm_source=page-token-meter&utm_medium=${spot}&utm_campaign=open-source`;
}

export const REPO_URL = "https://github.com/jacksonllk/page-token-meter";
// The name in link previews (og:site_name): Discord and others show it above the title.
export const SITE_NAME = "Page Token Meter";
// The maker, credited in the footer.
export const MAKER = { name: "Jackson Ling", url: "https://x.com/jackson_llk" };
