export const num = (n: number) => n.toLocaleString("en-US");

export const pct = (x: number) => `${Math.round(x * 100)}%`;

// In the visitor's time zone, or in UTC (labelled) where there is no visitor, such as the share image.
export function measuredAt(iso: string, timeZone?: "UTC") {
  const text = new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
  return timeZone ? `${text} UTC` : text;
}
