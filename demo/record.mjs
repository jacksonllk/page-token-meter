// Records a web app demo with headless Chrome, driven by a scenario file, and saves timed frames.
// Usage: node record.mjs <scenario.mjs> <frames-dir> [width] [height]
// The scenario exports `default async (demo) => { ... }` and uses the helpers below. Recording runs from
// demo.start() to the end of the scenario. Motion is done by the browser's compositor (CSS transitions, native
// smooth scroll), which keeps frames even. Frames are saved as <index>-<seconds>.png for encode.mjs.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [scenarioPath, framesDir, W = "800", H = "560"] = process.argv.slice(2);
if (!scenarioPath || !framesDir) {
  console.error("Usage: node record.mjs <scenario.mjs> <frames-dir> [width] [height]");
  process.exit(1);
}
// Draw with the GPU where there is one (Metal on macOS): busy moments, such as a result rendering during a scroll,
// stay smooth instead of dropping to software speed. GPU=off turns it off.
const GPU_FLAGS = process.env.GPU === "off" ? [] : ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])];
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9400 + Math.floor(Math.random() * 400);
const dir = resolve(framesDir);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "demo-gif-"))}`, "--no-first-run", "--hide-scrollbars", ...GPU_FLAGS, "about:blank"]);
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
  } catch {}
}
if (!target) throw new Error(`Chrome did not start. Set CHROME_PATH if it is not at ${CHROME}.`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const frames = [];
let recording = false;
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Page.screencastFrame") {
    if (recording) frames.push({ t: m.params.metadata.timestamp, data: m.params.data });
    ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: m.params.sessionId } }));
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const js = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`Page script failed: ${r.result.exceptionDetails.text} in ${expr.slice(0, 80)}`);
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.THEME ?? "light" }] });
await send("Emulation.setDeviceMetricsOverride", { width: Number(W), height: Number(H), deviceScaleFactor: 1, mobile: false });

// Finds an element: a CSS selector, or { text: "..." } for the smallest element whose text matches exactly.
const find = (what) =>
  typeof what === "string"
    ? `document.querySelector(${JSON.stringify(what)})`
    : `[...document.querySelectorAll(${JSON.stringify(what.within ?? "*")})].filter((el) => el.textContent.trim() === ${JSON.stringify(what.text)}).pop()`;
const centerOf = async (what) => {
  const c = await js(`(() => { const el = ${find(what)}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!c) throw new Error(`Not found on the page: ${JSON.stringify(what)}`);
  return c;
};

// pos: where the pointer dot is drawn. mouse: where the real mouse is. They differ when pointAt uses dx/dy,
// for example to keep a hovered element's highlight visible beside the dot.
let pos = { x: Number(W) / 2, y: Number(H) / 2 };
let mouse = { ...pos };
const dotStyle = `position: fixed; left: 0; top: 0; width: 14px; height: 14px; border-radius: 50%; background: rgba(11,15,25,0.4);
  border: 2px solid rgba(255,255,255,0.95); box-shadow: 0 2px 8px rgba(11,15,25,0.25); z-index: 2147483647; pointer-events: none; will-change: transform;`;
const placeDot = (x, y, ms, scale = 1) =>
  js(`(() => { let d = document.getElementById("demo-dot"); if (!d) { d = document.createElement("div"); d.id = "demo-dot"; d.style.cssText = ${JSON.stringify(dotStyle)}; document.body.appendChild(d); }
    d.style.transition = "transform ${ms}ms cubic-bezier(0.45, 0, 0.25, 1), opacity 200ms ease"; d.style.transform = "translate(${x - 7}px, ${y - 7}px) scale(${scale})"; })()`);

const demo = {
  /** Opens a page and waits for it to settle. */
  async goto(url, settleMs = 3000) {
    await send("Page.navigate", { url });
    await sleep(settleMs);
  },
  /** Removes elements whose text starts with these words, such as a dev-mode banner. */
  async hide(textStart, selector = "p, div") {
    await js(`(() => { for (const el of document.querySelectorAll(${JSON.stringify(selector)})) if (el.textContent.trim().startsWith(${JSON.stringify(textStart)})) el.remove(); })()`);
  },
  /** Scrolls so the element's top sits `offset` px from the top of the view. smooth: native smooth scroll. */
  async scrollTo(what, { offset = 0, smooth = true, waitMs = smooth ? 800 : 100 } = {}) {
    await js(`(() => { const el = ${find(what)}; window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - ${offset}, behavior: "${smooth ? "smooth" : "instant"}" }); })()`);
    await sleep(waitMs);
  },
  /** Shows the pointer at a spot without moving it there. */
  async showPointer(what, dx = 0, dy = 0) {
    const c = typeof what === "object" && "x" in what ? what : await centerOf(what);
    pos = { x: c.x + dx, y: c.y + dy };
    mouse = { ...pos };
    await placeDot(pos.x, pos.y, 0);
    await js(`document.getElementById("demo-dot").style.opacity = "1"`);
  },
  hidePointer: () => js(`(() => { const d = document.getElementById("demo-dot"); if (d) d.style.opacity = "0"; })()`),
  /** Glides the pointer to an element (or {x, y}), then moves the real mouse there, so hover effects show. */
  async pointAt(what, ms = 400, { dx = 0, dy = 0 } = {}) {
    const c = typeof what === "object" && "x" in what ? what : await centerOf(what);
    await placeDot(c.x + dx, c.y + dy, ms);
    await sleep(ms);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    pos = { x: c.x + dx, y: c.y + dy };
    mouse = { x: c.x, y: c.y };
  },
  /** Clicks where the mouse is. The pointer dot presses in and a soft ring pulses out from it. */
  async click() {
    await placeDot(pos.x, pos.y, 90, 0.72);
    const { x, y } = mouse;
    await js(`(() => { const r = document.createElement("div"); r.style.cssText = "position: fixed; left: ${pos.x - 18}px; top: ${pos.y - 18}px; width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(37,99,235,0.55); background: rgba(37,99,235,0.12); z-index: 2147483646; pointer-events: none;";
      document.body.appendChild(r);
      r.animate([{ transform: "scale(0.3)", opacity: 1 }, { transform: "scale(1.25)", opacity: 0 }], { duration: 420, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }).finished.then(() => r.remove()); })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(90);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await placeDot(pos.x, pos.y, 120, 1);
    await sleep(120);
  },
  /** Types into the focused field, one character at a time. */
  async type(text, msPerChar = 45) {
    for (const ch of text) {
      await send("Input.insertText", { text: ch });
      await sleep(msPerChar);
    }
  },
  /** Centres of an element's children, such as the cells of a grid, as {x, y} points. */
  childCenters: (selector) =>
    js(`(() => [...document.querySelector(${JSON.stringify(selector)}).children].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }))()`),
  wait: sleep,
  js,
  /** Starts recording. Everything before this is setup and not in the GIF. */
  async start() {
    await send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    recording = true;
  },
};

const scenario = (await import(pathToFileURL(resolve(scenarioPath)).href)).default;
try {
  await scenario(demo);
} finally {
  recording = false;
  await send("Page.stopScreencast").catch(() => {});
  ws.close();
  chrome.kill();
}
if (frames.length < 2) throw new Error("No frames recorded. Did the scenario call demo.start()?");
frames.forEach((f, i) => writeFileSync(join(dir, `${String(i).padStart(5, "0")}-${(f.t - frames[0].t).toFixed(3)}.png`), Buffer.from(f.data, "base64")));
const gaps = frames.slice(1).map((f, i) => (f.t - frames[i].t) * 1000).sort((a, b) => a - b);
console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s. Gap between frames: median ${gaps[gaps.length >> 1].toFixed(0)} ms, 95th percentile ${gaps[Math.floor(gaps.length * 0.95)].toFixed(0)} ms.`);
