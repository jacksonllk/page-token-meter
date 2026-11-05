import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parsePublicUrl } from "./keypages";
import { REPO_URL } from "./links";

// Downloads a small text file (an llms.txt, a page's own Markdown) straight from the site. No context.dev credit.
// "missing": the site says the file does not exist (404 or 410).
// "blocked": anything else went wrong, such as a bot wall or an HTML page, so the caller can ask context.dev instead.
export type TextResult = { status: "ok"; text: string } | { status: "missing" } | { status: "blocked" };
export type TextFetch = (url: string) => Promise<TextResult>;

const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

// Private, local and reserved addresses. Our server must never fetch these for a visitor.
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

// The address must be a public web address whose name points only to public servers.
async function allowed(url: URL): Promise<boolean> {
  if (!parsePublicUrl(url.href)) return false;
  try {
    const addresses = await lookup(url.hostname, { all: true });
    return addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

// Reads the body, stopping at max bytes. null when it is larger.
async function readBytes(res: Response, max: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function readText(res: Response): Promise<string | null> {
  const bytes = await readBytes(res, MAX_BYTES);
  return bytes && new TextDecoder().decode(bytes);
}

export const plainFetch: TextFetch = async (input) => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { status: "blocked" };
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // Redirects are followed by hand, so each new address is checked too.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await allowed(url))) return { status: "blocked" };
      const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": `PageTokenMeter (+${REPO_URL})`, accept: "text/markdown, text/plain;q=0.9" } });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel();
        return { status: "missing" };
      }
      // An HTML page in place of a text file is usually a bot wall or a "not found" page. Let context.dev decide.
      if (!res.ok || /html/i.test(res.headers.get("content-type") ?? "")) {
        await res.body?.cancel();
        return { status: "blocked" };
      }
      const text = await readText(res);
      return text === null ? { status: "blocked" } : { status: "ok", text };
    }
    return { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
};

const MAX_IMAGE_BYTES = 300_000;
const IMAGE_TIMEOUT_MS = 3000;

// Downloads a website's logo for a share image, as a data URL. PNG or JPEG only, 300 KB at most.
// The same address checks as plainFetch. null when anything is off: the card is drawn without the logo.
export async function fetchImage(input: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await allowed(url))) return null;
      const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": `PageTokenMeter (+${REPO_URL})`, accept: "image/png, image/jpeg" } });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!res.ok || !/^image\/(png|jpe?g)$/.test(type) || Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
        await res.body?.cancel();
        return null;
      }
      const bytes = await readBytes(res, MAX_IMAGE_BYTES);
      return bytes && bytes.byteLength > 0 ? `data:${type};base64,${bytes.toString("base64")}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Whether a page Map missed is there, such as /pricing, straight from the site: no credit. The same address checks as
// plainFetch. Only a 200 at the same path counts: a redirect to the home page means the website has no such page.
export async function pageExists(input: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  const wanted = url.pathname.replace(/\/$/, "");
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await allowed(url))) return false;
      const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": `PageTokenMeter (+${REPO_URL})` } });
      await res.body?.cancel();
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      return res.status === 200 && url.pathname.replace(/\/$/, "") === wanted;
    }
    return false;
  } catch {
    return false;
  }
}
