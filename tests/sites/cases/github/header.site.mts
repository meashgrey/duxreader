import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "../../types.mts";

export default {
  id: "github-header",
  url: "https://github.com/meashgrey",
  async run({ page, output, setEnabled, setTheme }) {
    // Public and authenticated templates differ. Inspect the actual header
    // landmarks and known bar containers instead of an arbitrary page region.
    const headers = page.locator(
      'header.GlobalNav,header[role="banner"],.AppHeader,.AppHeader-globalBar,.AppHeader-localBar,.Header',
    );
    await headers.first().waitFor();
    const snapshot = async () => ({
      root: await page
        .locator("html")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      headers: await headers.evaluateAll((nodes) =>
        nodes.map((node) => ({
          class: node.className,
          color: getComputedStyle(node).backgroundColor,
        })),
      ),
    });
    const before = await snapshot();
    await page.screenshot({ path: resolve(output, "disabled.png") });
    await setEnabled(true);
    await expect
      .poll(async () =>
        (await snapshot()).headers.every(
          (node) => node.color === "rgb(17, 19, 24)",
        ),
      )
      .toBe(true);
    const after = await snapshot();
    assert.equal(after.root, "rgb(17, 19, 24)");
    await page.screenshot({ path: resolve(output, "enabled.png") });
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
    await expect
      .poll(async () =>
        (await snapshot()).headers.every(
          (node) => node.color === "rgb(23, 18, 28)",
        ),
      )
      .toBe(true);
    const changed = await snapshot();
    assert.equal(changed.root, "rgb(23, 18, 28)");
    await page.screenshot({ path: resolve(output, "changed-palette.png") });
    return { before, after, changed };
  },
} satisfies SiteCase;
