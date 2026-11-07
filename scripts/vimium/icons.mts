import { Resvg } from "@resvg/resvg-js";
import { mkdir } from "node:fs/promises";

// Chromium needs raster toolbar icons. Render all sizes from the same owned
// SVG source, including the paths used by upstream's status notifications.
export async function buildIcons() {
  await mkdir("public/icons", { recursive: true });
  const source = await Bun.file("public/duxlogo.svg").text();
  const square = source
    .replace(/width="[^"]+"/, 'width="128"')
    .replace(/height="[^"]+"/, 'height="128"')
    .replace(/viewBox="[^"]+"/, 'viewBox="-49.621665 -12 582.15 582.15"');
  await Bun.write("public/icons/icon.svg", square);
  for (const size of [16, 32, 48, 96, 128]) {
    const png = new Resvg(square, { fitTo: { mode: "width", value: size } })
      .render()
      .asPng();
    await Bun.write(`public/icons/icon${size}.png`, png);
  }
  // Preserve Vimium's enabled/partial/disabled indication using opacity while
  // retaining Duxreader's identity in every browser and on every page.
  for (const [state, opacity] of [
    ["enabled", 1],
    ["partial", 0.7],
    ["disabled", 0.4],
  ] as const) {
    const svg = square.replace(
      '<path fill="url(#stripes)"',
      `<path opacity="${opacity}" fill="url(#stripes)"`,
    );
    await Bun.write(`public/icons/action_${state}.svg`, svg);
    for (const size of [16, 32]) {
      const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
        .render()
        .asPng();
      await Bun.write(`public/icons/action_${state}_${size}.png`, png);
    }
  }
}
