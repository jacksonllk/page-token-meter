// The README demo: measure one page, then point at the heatmap so the text panel jumps to each block's text.
// Recorded with the make-demo-gif pipeline (see demo/README.md). DEMO_URL: the app to record, default a local copy.
export default async function demo(d) {
  await d.goto(process.env.DEMO_URL ?? "http://localhost:3000/");
  await d.hide("Fixture mode");
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
  await d.wait(1800);

  // The heatmap with the text panel below it.
  await d.scrollTo('[role="img"]', { offset: 14, waitMs: 750 });

  // Click a few blocks. The pointer rests off the block's corner so its highlight ring stays visible.
  const cells = await d.childCenters('[role="img"]');
  const at = (col, row) => cells[row * 12 + col];
  await d.showPointer(at(11, 1), 24, 9);
  for (const [col, row, rest] of [[8, 1, 450], [3, 5, 450], [7, 9, 450], [5, 14, 800]]) {
    await d.pointAt(at(col, row), 260, { dx: 9, dy: 9 });
    await d.click();
    await d.wait(rest);
  }
}
