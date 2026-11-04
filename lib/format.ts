export const num = (n: number) => n.toLocaleString("en-US");

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function measuredAt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
