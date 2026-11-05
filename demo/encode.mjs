// Turns timed frames from record.mjs into an even-paced GIF with ffmpeg's two-pass palette.
// Usage: node encode.mjs <frames-dir> <out.gif> [fps] [width]. Default 50 fps: the fastest GIF rate browsers play
// reliably (frames shorter than 20 ms get slowed to 100 ms). The recorder captures about 60 fps.
// Each frame is shown for as long as it was on screen while recording, then ffmpeg resamples to an even fps.
// The palette is built from what changes between frames (stats_mode=diff) and only changed areas are stored
// (diff_mode=rectangle), which keeps UI demos small without visible banding.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

// ffmpeg: FFMPEG_PATH, else the ffmpeg-static package (installed next to this script), else ffmpeg on the PATH.
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_PATH ?? (() => {
  try {
    return require("ffmpeg-static");
  } catch {
    return "ffmpeg";
  }
})();
const [framesDir, out, fps = "50", width] = process.argv.slice(2);
if (!framesDir || !out) {
  console.error("Usage: node encode.mjs <frames-dir> <out.gif> [fps] [width]");
  process.exit(1);
}
const dir = resolve(framesDir);
const frames = readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => ({ file: join(dir, f), t: Number(f.slice(f.indexOf("-") + 1, -4)) }));
if (frames.length < 2) throw new Error(`No frames in ${dir}`);

// ffmpeg's concat list: each frame with how long it stayed on screen. The last one is held for a second.
const lines = frames.flatMap((f, i) => [`file '${f.file.replace(/'/g, "'\\''")}'`, `duration ${i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - f.t).toFixed(3) : "1.000"}`]);
lines.push(`file '${frames.at(-1).file.replace(/'/g, "'\\''")}'`);
const list = join(dir, "frames.txt");
writeFileSync(list, lines.join("\n") + "\n");

const scale = width ? `,scale=${width}:-1:flags=lanczos` : "";
const filter = `fps=${fps}${scale},split[a][b];[a]palettegen=stats_mode=diff:max_colors=256[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", filter, "-loop", "0", resolve(out)], { stdio: "inherit" });
const seconds = frames.at(-1).t + 1;
console.log(`${resolve(out)}: ${(statSync(resolve(out)).size / 1024 / 1024).toFixed(2)} MB, about ${seconds.toFixed(1)} s at ${fps} fps.`);
