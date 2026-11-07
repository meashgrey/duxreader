import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { SiteCase } from "./types.mts";

// Shared assertions for ordinary documents. Each site supplies its own ready
// landmark and optional surface selector; site-specific data tests stay local.
export function themePage(
  id: string,
  url: string,
  heading: string,
  surface?: string,
): SiteCase {
  return {
    id,
    url,
    async run({ page, output, setEnabled }) {
      await page
        .getByRole("heading", { name: heading, exact: true })
        .first()
        .waitFor();
      const snapshot = () =>
        page.evaluate(
          (surface) => ({
            root: getComputedStyle(document.documentElement).backgroundColor,
            heading: getComputedStyle(document.querySelector("h1")!).color,
            surface: surface
              ? getComputedStyle(document.querySelector(surface)!)
                  .backgroundColor
              : undefined,
          }),
          surface,
        );
      const before = await snapshot();
      await page.screenshot({ path: resolve(output, "disabled.png") });
      await setEnabled(true);
      await expect.poll(snapshot).toMatchObject({
        root: "rgb(17, 19, 24)",
        heading: "rgb(225, 226, 233)",
        ...(surface ? { surface: "rgb(17, 19, 24)" } : {}),
      });
      const after = await snapshot();
      await page.screenshot({ path: resolve(output, "enabled.png") });
      assert.notEqual(
        before.root,
        after.root,
        "The page must actually change theme",
      );
      return { before, after };
    },
  };
}
