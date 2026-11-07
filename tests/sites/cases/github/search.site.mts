import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "../../types.mts";

export default {
  id: "github-search",
  url: "https://github.com/search?q=rust&type=repositories",
  async run({ page, output, setEnabled }) {
    const main = page.locator("main");
    // Observe all actual inline background colors, independently of the
    // protection selectors. Both facets and result footer dots are covered.
    const snapshot = () =>
      main.evaluate((root) => ({
        html: root.outerHTML,
        rootBackground: getComputedStyle(document.documentElement)
          .backgroundColor,
        swatches: [...root.querySelectorAll<HTMLElement>("[style]")]
          .filter((node) => node.style.backgroundColor !== "")
          .map((node, index) => ({
            key: `${index}:${node.closest("li")?.textContent?.trim() ?? ""}`,
            source: node.style.backgroundColor,
            actual: getComputedStyle(node).backgroundColor,
            overridden: node.hasAttribute("data-darkreader-inline-bgcolor"),
          })),
      }));
    await expect
      .poll(async () => (await snapshot()).swatches.length, { timeout: 30000 })
      .toBeGreaterThan(1);
    const before = await snapshot();
    await main.screenshot({ path: resolve(output, "disabled.png") });
    await setEnabled(true);
    const after = await snapshot();
    await main.screenshot({ path: resolve(output, "enabled.png") });
    const failures: string[] = [];
    if (after.rootBackground !== "rgb(17, 19, 24)")
      failures.push("Desktop theming was not applied");
    if (after.swatches.length !== before.swatches.length)
      failures.push("Search result color sources changed during measurement");
    for (const [i, original] of before.swatches.entries()) {
      const current = after.swatches[i];
      if (
        !current ||
        current.key !== original.key ||
        current.actual !== original.actual ||
        current.overridden
      )
        failures.push(
          `${original.key}: ${original.actual} -> ${current?.actual ?? "missing"}`,
        );
    }
    await Bun.write(
      resolve(output, "comparison.json"),
      JSON.stringify({ before, after, failures }, null, 2) + "\n",
    );
    assert.deepEqual(
      failures,
      [],
      "Search language colors must remain unchanged",
    );
    return { before, after, failures };
  },
} satisfies SiteCase;
