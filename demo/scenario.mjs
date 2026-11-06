// The README demo: measure one page, then click squares of its token map so the text panel jumps to their text.
// Recorded with demo/record.mjs and demo/encode.mjs (see demo/README.md). DEMO_URL: the app to record, default a local copy.
export default async function demo(d) {
  await d.goto(process.env.DEMO_URL ?? "http://localhost:3000/");
  await d.hide("Fixture mode");
  // The demo runs on saved responses with made-up step times, so the elapsed time is hidden (it would also look faster than a real check).
  await d.js(`new MutationObserver(() => { for (const el of document.querySelectorAll("span.label")) if (el.textContent === "Elapsed") el.parentElement.style.visibility = "hidden"; }).observe(document.body, { childList: true, subtree: true })`);
  await d.scrollTo("form", { offset: 200, smooth: false });
  await d.showPointer("form input", 140, 60);
  await d.start();
  await d.wait(350);

  // One page, then the address, then Measure.
  await d.pointAt({ text: "One page", within: "button" }, 380);
  await d.click();
  await d.pointAt("form input", 380);
  await d.click();
  await d.type("docs.context.dev");
  await d.wait(150);
  await d.pointAt("form button[type=submit]", 380);
  await d.click();
  await d.hidePointer();
  // The app scrolls to the result by itself.
  await d.wait(1200);

  // The token map with the text panel below it.
  await d.scrollTo('[role="img"]', { offset: 14, waitMs: 750 });

  // Click three squares, slowly: the menu, a link in the article, the footer.
  // The pointer rests off the square's corner so its highlight ring stays visible.
  // The map's first child is the cover that slides away when the result appears, not a square.
  const cells = (await d.childCenters('[role="img"]')).slice(1);
  const at = (col, row) => cells[row * 12 + col];
  await d.showPointer(at(11, 1), 24, 9);
  for (const [col, row, rest] of [[8, 1, 1100], [3, 10, 1100], [8, 15, 1400]]) {
    await d.pointAt(at(col, row), 420, { dx: 9, dy: 9 });
    await d.click();
    await d.wait(rest);
  }
}
