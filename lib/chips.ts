// The try chips under the input: example websites whose results are kept with no expiry, so a click costs 0 credits.
export const CHIPS = ["stripe.com", "posthog.com", "vercel.com"];

export const isChip = (domain: string) => CHIPS.includes(domain);
