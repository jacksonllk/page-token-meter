# Demo

`demo.gif` is the image at the top of the README: measuring one page (docs.context.dev), then pointing at squares of its token map to see their text. 800 × 560, 50 frames a second.

To make it again, run the app (`npm run build && npm start`), then:

```bash
DEMO_URL=http://localhost:3000/ node demo/record.mjs demo/scenario.mjs demo/frames 800 560
npm install --no-save ffmpeg-static   # or have ffmpeg on your PATH
node demo/encode.mjs demo/frames demo/demo.gif 50
```

- `scenario.mjs` is the demo: what to click, type and point at.
- `record.mjs` plays it in headless Chrome and saves timed frames to `demo/frames/` (git-ignored). Set `CHROME_PATH` if Chrome is not at its macOS path.
- `encode.mjs` turns the frames into the GIF with ffmpeg.

A live run measures the page with your context.dev key (2 credits). A page checked in the last 24 hours comes from the cache for free.
