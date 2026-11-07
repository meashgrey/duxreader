import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { defaultTheme } from "../lib/theme";

const extension = resolve(".output/chrome-mv3");
const output = resolve(".temp/preferences");
await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  viewport: { width: 1440, height: 1000 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  await worker.evaluate(async (theme) => {
    await (globalThis as any).chrome.storage.local.set({
      theme,
      sourcePath: "",
      enabled: false,
    });
  }, defaultTheme);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Preferences page:", error.stack);
  });
  await page.goto(`chrome-extension://${id}/pages/options.html`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(output, "initial.png") });
  await expect(page.locator('[name="scrollStepSize"]')).not.toHaveValue("");
  await expect(page.locator('[name="keyMappings"]')).not.toHaveValue("");
  const source = await Bun.file("vendor/vimium/pages/options.html").text();
  const upstreamNames = [
    ...new Set(
      [...source.matchAll(/name="([^"]+)"/g)].map((match) => match[1]!),
    ),
  ].filter((name) => !["color-scheme"].includes(name));
  for (const name of upstreamNames)
    await expect(page.locator(`[name="${name}"]`).first()).toBeAttached();
  await page.screenshot({ path: resolve(output, "desktop.png") });
  const keys = page.locator('[name="keyMappings"]');
  const originalKeys = await keys.inputValue();
  await keys.fill("map z definitelyUnknownCommand");
  await page.locator("#save").click();
  await expect(page.locator(".validation-message")).toBeVisible();
  await keys.fill(originalKeys + "\nmap z scrollDown");
  await page.locator("#save").click();
  await expect(page.locator("#save")).toBeDisabled();
  await page.reload();
  await expect(keys).toHaveValue(originalKeys + "\nmap z scrollDown");

  await page.locator("#exclusion-add-button").click();
  const row = page.locator("#exclusion-rules .rule").last();
  await row.locator('[name="pattern"]').fill("https://example.com/*");
  await row.locator('[name="passKeys"]').fill("jk");
  await page.locator("#save").click();
  await page.reload();
  await expect(page.locator('[name="pattern"]').last()).toHaveValue(
    "https://example.com/*",
  );
  await page
    .locator("#exclusion-rules .rule")
    .last()
    .locator(".remove svg")
    .click();
  await page.locator("#save").click();
  await expect(page.locator("#save")).toBeDisabled();

  await page.locator('[name="filterLinkHints"]').check();
  await expect(page.locator("#link-hint-numbers-container")).toBeVisible();
  await expect(page.locator("#link-hint-characters-container")).toBeHidden();
  await expect(page.locator("#wait-for-enter")).toBeVisible();
  await page.locator('[name="linkHintNumbers"]').fill("12");
  await page.locator("#link-hint-numbers-container .reset-link a").click();
  await expect(page.locator('[name="linkHintNumbers"]')).not.toHaveValue("12");
  await page.locator('[name="newTabDestination"][value="customUrl"]').check();
  await expect(page.locator('[name="newTabCustomUrl"]')).toBeVisible();
  await page.locator('[name="newTabCustomUrl"]').fill("https://example.com/");
  await page.locator("#save").click();
  await expect(page.locator("#save")).toBeDisabled();

  // The upstream export is a JSON blob prepared on mousedown.
  await page.locator("#download-backup").dispatchEvent("mousedown");
  const backup = await page
    .locator("#download-backup")
    .evaluate(
      async (link) =>
        await (await fetch((link as HTMLAnchorElement).href)).json(),
    );
  assert.equal(backup.newTabCustomUrl, "https://example.com/");
  backup.scrollStepSize = 123;
  await page.locator("#upload-backup").setInputFiles({
    name: "vimium-options.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('[name="scrollStepSize"]')).toHaveValue("123");
  await expect(page.locator("#save")).toBeDisabled();
  await page.locator("#ui-font").selectOption("system");
  await expect(page.locator("#font-status")).toHaveText("Font saved");
  await page.goto(`chrome-extension://${id}/pages/options.html#sites`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#exclusion-add-button")).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: resolve(output, "mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`chrome-extension://${id}/pages/options.html#appearance`);
  await worker.evaluate(
    async (theme) => {
      await (globalThis as any).chrome.storage.local.set({ theme });
    },
    {
      ...defaultTheme,
      mode: "light",
      colors: {
        background: "#faf7ff",
        surface: "#f0ecf4",
        foreground: "#1d1b20",
        accent: "#65558f",
      },
      material: undefined,
    },
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(250, 247, 255)",
  );
  await page.screenshot({ path: resolve(output, "light.png") });
  assert.deepEqual(errors, []);
  console.log(
    `Preferences: all ${upstreamNames.length} original fields, validation, save/reload, rules, reset, conditional settings, export/import, font, theme and responsive layout passed.`,
  );
} finally {
  await context.close();
}
