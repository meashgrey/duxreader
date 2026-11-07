import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "../../types.mts";

export default {
  id: "github",
  url: "https://github.com/meashgrey/duxreader",
  async run({ page, output, setEnabled }) {
    const heading = page.getByRole("heading", {
      name: "Languages",
      exact: true,
    });
    await heading.waitFor({ timeout: 15000 });
    const section = heading.locator("..");
    // GitHub renders the heading before its asynchronous language data arrives.
    // Wait for real color sources rather than accepting the loading skeleton.
    await expect
      .poll(
        () =>
          section.evaluate(
            (root) =>
              [...root.querySelectorAll<HTMLElement>("[style]")].filter(
                (node) => node.style.backgroundColor !== "",
              ).length,
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(2);

    const snapshot = () =>
      section.evaluate((root) => ({
        html: root.outerHTML,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        // Collect actual inline color sources independently of the preservation
        // selectors, so a missed component also appears as a test failure.
        swatches: [...root.querySelectorAll<HTMLElement>("[style]")]
          .filter((node) => node.style.backgroundColor !== "")
          .map((node) => ({
            key:
              node.getAttribute("aria-label") ??
              node.parentElement?.getAttribute("href") ??
              node.className,
            source: node.style.backgroundColor,
            actual: getComputedStyle(node).backgroundColor,
            overridden: node.hasAttribute("data-darkreader-inline-bgcolor"),
          })),
      }));
    const before = await snapshot();
    await Bun.write(
      resolve(output, "before.json"),
      JSON.stringify(before, null, 2),
    );
    assert(
      before.swatches.length >= 2,
      "The live language section must contain identifiable swatches",
    );
    await section.screenshot({ path: resolve(output, "disabled.png") });
    await setEnabled(true);
    const after = await snapshot();
    await section.screenshot({ path: resolve(output, "enabled.png") });
    const failures: string[] = [];
    if (after.bodyBackground !== "rgb(17, 19, 24)")
      failures.push("Desktop background was not applied");
    if (after.swatches.length !== before.swatches.length)
      failures.push("The number of live swatches changed");
    for (const [i, old] of before.swatches.entries()) {
      const current = after.swatches[i];
      if (
        !current ||
        current.key !== old.key ||
        current.actual !== old.actual ||
        current.overridden
      )
        failures.push(
          `${old.key}: ${old.actual} -> ${current?.actual ?? "missing"}`,
        );
    }
    await Bun.write(
      resolve(output, "comparison.json"),
      JSON.stringify({ before, after, failures }, null, 2) + "\n",
    );
    assert.deepEqual(
      failures,
      [],
      "GitHub language colors must survive desktop theming",
    );
    return { before, after, failures };
  },
} satisfies SiteCase;
