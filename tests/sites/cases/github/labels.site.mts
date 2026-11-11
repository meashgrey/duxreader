import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "../../types.mts";

// Token labels derive their colors from inline variables. The engine replaces
// unresolved variables with palette roles, so labels must keep their native
// formula for every label rather than one snapshot per label.
export default {
  id: "github-labels",
  url: "https://github.com/microsoft/vscode/issues",
  async run({ page, output, setEnabled }) {
    const labels = page.locator('span[class*="Token-IssueLabel"]');
    await labels.first().waitFor();
    await page.waitForTimeout(1500);
    const snapshot = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('span[class*="Token-IssueLabel"]')]
          .slice(0, 5)
          .map((node) => {
            const style = getComputedStyle(node);
            return {
              text: node.textContent?.trim(),
              color: style.color,
              background: style.backgroundColor,
            };
          }),
      );
    const before = await snapshot();
    assert.ok(before.length >= 3, "Expected public issue labels");
    await page.screenshot({ path: resolve(output, "disabled.png") });
    await setEnabled(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
      )
      .toBe("rgb(17, 19, 24)");
    await page.waitForTimeout(1500);
    const after = await snapshot();
    assert.deepEqual(
      after.slice(0, before.length),
      before,
      "Every label must keep its native color",
    );
    await page.screenshot({ path: resolve(output, "enabled.png") });
    return { before, after };
  },
} satisfies SiteCase;
