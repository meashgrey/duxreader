import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "../../types.mts";

// GitHub renders Mermaid in a cross-origin viewscreen frame. The frame already
// follows GitHub's own color mode, so the extension must leave it untouched.
export default {
  id: "github-mermaid",
  url: "https://github.com/arras-energy/gridlabd",
  async run({ page, output, setEnabled, setTheme }) {
    const section = page
      .locator('section[aria-label="mermaid rendered output container"]')
      .first();
    // GitHub swaps the lazy enrichment frame while it settles, so let the
    // frameLocator retry across detached frames instead of caching one.
    const diagram = page
      .frameLocator('iframe[src*="/markdown/mermaid"]')
      .locator("svg.flowchart");
    const waitForDiagram = async () => {
      await section.scrollIntoViewIfNeeded();
      await expect(diagram).toBeVisible({ timeout: 60000 });
    };
    try {
      await waitForDiagram();
    } catch {
      // The viewscreen renderer occasionally gives up on its first lazy load.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await waitForDiagram();
    }

    const mermaid = () =>
      page.frames().find((frame) => frame.url().includes("/markdown/mermaid"));

    const snapshot = async () => {
      const frame = mermaid();
      if (!frame) return null;
      return frame
        .evaluate(() => {
          const svg = document.querySelector<SVGSVGElement>("svg.flowchart")!;
          if (!svg) return null;
          const paint = (node: Element) => ({
            fill: getComputedStyle(node).fill,
            stroke: getComputedStyle(node).stroke,
          });
          return {
            themed: document.documentElement.hasAttribute(
              "data-darkreader-mode",
            ),
            colorMode: document.documentElement.getAttribute("data-color-mode"),
            bodyBackground: getComputedStyle(document.body).backgroundColor,
            svg: paint(svg),
            nodes: [
              ...svg.querySelectorAll(".node rect, .node polygon, .node circle"),
            ]
              .slice(0, 6)
              .map(paint),
            labels: [...svg.querySelectorAll(".nodeLabel")]
              .slice(0, 6)
              .map((node) => getComputedStyle(node).color),
          };
        })
        .catch(() => null);
    };

    await expect.poll(snapshot, { timeout: 30000 }).not.toBeNull();
    const before = (await snapshot())!;
    assert(before.nodes.length > 0, "The Mermaid diagram must contain nodes");
    assert(before.labels.length > 0, "The Mermaid diagram must contain labels");
    await section.screenshot({ path: resolve(output, "disabled.png") });

    await setEnabled(true);
    await expect.poll(snapshot, { timeout: 30000 }).not.toBeNull();
    const after = (await snapshot())!;
    await section.screenshot({ path: resolve(output, "enabled.png") });
    assert.equal(after.themed, false, "The Mermaid frame must stay unthemed");
    assert.deepEqual(after, before, "The Mermaid diagram must stay unchanged");

    await setTheme({
      mode: "dark",
      css: "",
      colors: {
        background: "#17121c",
        surface: "#312838",
        foreground: "#e8def8",
        accent: "#d0bcff",
      },
    });
    await expect.poll(snapshot, { timeout: 30000 }).not.toBeNull();
    const changed = (await snapshot())!;
    await section.screenshot({ path: resolve(output, "changed-palette.png") });
    assert.equal(changed.themed, false, "Palette updates must not enter the frame");
    assert.deepEqual(changed, before, "Palette updates must not recolor Mermaid");
    return { before, after, changed };
  },
} satisfies SiteCase;
