// A website's logo, from the HTML we already loaded: no extra credit.
// The largest square icon the page declares (apple-touch-icon first: usually 180 px), PNG or JPEG only,
// because share images cannot draw SVG favicons or .ico files reliably. Too small (under 64 px) looks blurry: skipped.
// No usable icon: /apple-touch-icon.png on the page's host, where iOS looks by convention. Callers check it is a real image.

const MIN_SIZE = 64;

// An attribute's value, with the HTML entities that appear in addresses decoded ("&amp;" in a query string).
const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1]
    ?.replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&");

export function pickLogo(html: string, pageUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  let best: { href: string; size: number } | null = null;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const href = attr(tag, "href");
    if (!href || !/\bicon\b|apple-touch-icon/.test(rel)) continue;
    // A dark-mode icon is often white: it would vanish on our light cards.
    if (/prefers-color-scheme:\s*dark/i.test(attr(tag, "media") ?? "")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const type = attr(tag, "type")?.toLowerCase();
    const raster = type ? /image\/(png|jpe?g)/.test(type) : /\.(png|jpe?g)$/i.test(url.pathname);
    if (!raster) continue;
    const declared = Math.max(0, ...(attr(tag, "sizes") ?? "").split(/\s+/).map((s) => Number(s.split(/x/i)[0]) || 0));
    const size = declared || (rel.includes("apple-touch-icon") ? 180 : 0);
    if (size >= MIN_SIZE && (!best || size > best.size)) best = { href: url.href, size };
  }
  return best?.href ?? new URL("/apple-touch-icon.png", base).href;
}
