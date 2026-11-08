import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { luminance, parseColor } from "../lib/color-roles";

const extension = resolve(".output/chrome-mv3");
assert(
  await Bun.file(resolve(extension, "manifest.json")).exists(),
  "Run bun run build first",
);
const output = resolve(".temp/vimium");
await mkdir(output, { recursive: true });

const colors = {
  background: "#111318",
  surface: "#1d2024",
  foreground: "#e1e2e9",
  accent: "#a8c8ff",
};
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/target") {
      return new Response(
        "<!doctype html><title>Target</title><h1>Target page</h1>",
        { headers: { "content-type": "text/html" } },
      );
    }
    return new Response(
      `<!doctype html><html><head><title>Vimium compatibility</title></head><body>
      <h1>Vimium compatibility</h1>
      <p>Vimium text for find mode.</p>
      <p><a href="/target">Example target</a></p>
      <div style="height:3000px"></div>
      </body></html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(
    async ({ url, colors }) => {
      const api = (globalThis as any).chrome;
      await api.storage.local.set({
        enabled: true,
        sourceMode: "file",
        sourcePath: "",
        theme: { mode: "dark", css: "", colors },
      });
      await api.bookmarks.create({ title: "Local target", url });
      for (let index = 0; index < 20; index++)
        await api.bookmarks.create({
          title: `Scroll target ${index}`,
          url: `${url}#scroll-${index}`,
        });
    },
    { url: `${server.url.origin}/target`, colors },
  );

  const page = await context.newPage();
  await page.goto(server.url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.darkreaderMode === "dynamic",
    undefined,
    { timeout: 15000 },
  );
  const clickPage = async () => {
    await page.mouse.click(20, 20);
    await page.waitForTimeout(150);
  };

  // Default normal-mode shortcuts are unchanged.
  await clickPage();
  await page.keyboard.press("j");
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => scrollY)) > 0,
    "j must keep scrolling the page",
  );

  // Link hints keep their shortcut and adopt palette colors.
  await clickPage();
  await page.keyboard.press("f");
  const hint = page.locator("div.internal-vimium-hint-marker").first();
  await hint.waitFor({ timeout: 10000 });
  const hintColors = await hint.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    border: getComputedStyle(node).borderColor,
    color: getComputedStyle(node).color,
  }));
  assert.equal(hintColors.background, rgb(colors.surface));
  assert.equal(hintColors.border, rgb(colors.accent));
  assert.equal(hintColors.color, rgb(colors.foreground));
  await page.screenshot({ path: resolve(output, "link-hints.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Vomnibar is the React/Material implementation and uses the same palette.
  await clickPage();
  await page.keyboard.press("o");
  const vomnibar = await (async () => {
    for (let i = 0; i < 60; i++) {
      const frame = page
        .frames()
        .find((item) => item.url().includes("/vomnibar.html"));
      if (frame) return frame;
      await page.waitForTimeout(100);
    }
    throw new Error("Vomnibar frame did not open");
  })();
  await vomnibar.locator("input").fill("Local target");
  await vomnibar.locator("li").first().waitFor({ timeout: 15000 });
  await page.keyboard.press("ArrowDown");
  const selection = vomnibar.locator("li.selected");
  await selection.waitFor();
  const vomnibarColors = await vomnibar.evaluate(() => {
    const selected = document.querySelector("li.selected")!;
    return {
      primary: getComputedStyle(document.documentElement)
        .getPropertyValue("--md-sys-color-primary")
        .trim(),
      selected: getComputedStyle(selected).backgroundColor,
      selectedText: getComputedStyle(selected).color,
      list: getComputedStyle(document.querySelector(".vomnibar")!)
        .backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    };
  });
  assert.equal(vomnibarColors.primary, colors.accent);
  assert.equal(vomnibarColors.body, "rgba(0, 0, 0, 0)");
  const selectedColor = parseColor(vomnibarColors.selected)!;
  const listColor = parseColor(vomnibarColors.list)!;
  const selectedText = parseColor(vomnibarColors.selectedText)!;
  const contrast = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert(
    contrast(luminance(selectedColor), luminance(listColor)) > 1.15,
    "The selected Vomnibar row must contrast with the list surface",
  );
  assert(
    contrast(luminance(selectedColor), luminance(selectedText)) >= 4.5,
    "Selected Vomnibar text must remain readable",
  );
  await page.screenshot({ path: resolve(output, "vomnibar.png") });
  await page.keyboard.press("Escape");
  for (let i = 0; i < 60; i++) {
    const hidden = await page.evaluate(() => {
      for (const host of document.querySelectorAll("div.vimium-reset")) {
        const frame = host.shadowRoot?.querySelector("iframe.vomnibar-frame");
        if (frame)
          return frame.classList.contains("vimium-ui-component-hidden");
      }
      return false;
    });
    if (hidden) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);

  // Long result lists scroll as the keyboard selection moves beyond the fold.
  await page.setViewportSize({ width: 1280, height: 420 });
  await clickPage();
  await page.keyboard.press("o");
  const scrollVomnibar = await (async () => {
    for (let i = 0; i < 60; i++) {
      const frame = page
        .frames()
        .find((item) => item.url().includes("/vomnibar.html"));
      if (frame) return frame;
      await page.waitForTimeout(100);
    }
    throw new Error("Vomnibar frame did not open for scrolling");
  })();
  await expect(scrollVomnibar.locator("input")).toBeFocused();
  const collapsedSearch = await scrollVomnibar.locator("input").boundingBox();
  assert(collapsedSearch, "The collapsed search field must be visible");
  await scrollVomnibar.locator("input").fill("Scroll target");
  await scrollVomnibar.locator("li").first().waitFor({ timeout: 15000 });
  assert(
    (await scrollVomnibar.locator("li").count()) > 10,
    "Omni searches must expose more than the upstream ten-result shortlist",
  );
  for (const height of [900, 420]) {
    await page.setViewportSize({ width: 1280, height });
    await expect
      .poll(async () => {
        const panel = await scrollVomnibar.locator(".vomnibar").boundingBox();
        return (
          !!panel &&
          Math.abs(panel.y + panel.height / 2 - height / 2) <= 2 &&
          panel.height <= Math.min(560, height * 0.7) + 1
        );
      })
      .toBe(true);
    if (height === 900)
      await page.screenshot({ path: resolve(output, "vomnibar-centered.png") });
  }
  const expandedSearch = await scrollVomnibar.locator("input").boundingBox();
  assert(
    expandedSearch && Math.abs(expandedSearch.y - collapsedSearch.y) <= 1,
    "Expanding results must not move the search field",
  );
  for (let index = 0; index < 9; index++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
  }
  const measureSelection = () => {
    const list = document.querySelector<HTMLElement>("#vomnibar-results")!;
    const selected = document.querySelector<HTMLElement>("li.selected")!;
    const listRect = list.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    return {
      scrollTop: list.scrollTop,
      visible:
        selectedRect.top >= listRect.top - 1 &&
        selectedRect.bottom <= listRect.bottom + 1,
    };
  };
  const scrollState = await scrollVomnibar.evaluate(measureSelection);
  assert(scrollState.scrollTop > 0, "The result list must scroll");
  assert(scrollState.visible, "The selected result must remain visible");
  await page.screenshot({ path: resolve(output, "vomnibar-scroll.png") });
  const resultCount = await scrollVomnibar.locator("li").count();
  const startId = await scrollVomnibar
    .locator("li.selected")
    .getAttribute("id");
  const startIndex = Number(startId!.split("-").at(-1));
  for (let step = 0; step < resultCount; step++) {
    await page.keyboard.press("Tab");
    const selected = scrollVomnibar.locator("li.selected");
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute(
      "id",
      `vomnibar-option-${(startIndex + step + 1) % resultCount}`,
    );
    await expect
      .poll(
        async () => (await scrollVomnibar.evaluate(measureSelection)).visible,
      )
      .toBe(true);
  }
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(
        async () => (await scrollVomnibar.evaluate(measureSelection)).visible,
      )
      .toBe(true);
  }
  assert(
    (await scrollVomnibar.evaluate(measureSelection)).scrollTop <
      scrollState.scrollTop,
    "Reverse selection must scroll toward the top",
  );
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(async () => (await scrollVomnibar.evaluate(measureSelection)).visible)
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 340 });
  await expect
    .poll(async () => (await scrollVomnibar.evaluate(measureSelection)).visible)
    .toBe(true);

  // A slow empty-query completion reply must not allow native Tab traversal.
  await scrollVomnibar.evaluate(() => {
    const api = (globalThis as any).chrome;
    const send = api.runtime.sendMessage.bind(api.runtime);
    api.runtime.sendMessage = async (payload: { handler?: string }) => {
      if (payload.handler === "filterCompletions")
        await new Promise((resolve) => setTimeout(resolve, 150));
      return send(payload);
    };
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab")
          setTimeout(() => {
            (globalThis as any).tabDefaultPrevented = event.defaultPrevented;
          }, 0);
      },
      true,
    );
  });
  await scrollVomnibar.locator("input").fill("");
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      scrollVomnibar.evaluate(() => (globalThis as any).tabDefaultPrevented),
    )
    .toBe(true);
  await expect(scrollVomnibar.locator("input")).toBeFocused();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The tab switcher must scroll its full set of candidates as well as omni results.
  const tabIds = await worker.evaluate(async (origin) => {
    const api = (globalThis as any).chrome;
    return Promise.all(
      Array.from({ length: 14 }, async (_, index) => {
        const tab = await api.tabs.create({
          url: `${origin}/target?scroll-tab=${index}`,
          active: false,
        });
        return tab.id as number;
      }),
    );
  }, server.url.origin);
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.bringToFront();
  await clickPage();
  await page.keyboard.press("T");
  await expect(scrollVomnibar.locator("input")).toBeFocused();
  await expect
    .poll(() => scrollVomnibar.locator("li").count())
    .toBeGreaterThan(10);
  for (let index = 0; index < 12; index++) await page.keyboard.press("Tab");
  await expect
    .poll(async () => (await scrollVomnibar.evaluate(measureSelection)).visible)
    .toBe(true);
  assert(
    (await scrollVomnibar.evaluate(measureSelection)).scrollTop > 0,
    "Tab switcher must scroll to candidates past the initial viewport",
  );
  await page.screenshot({ path: resolve(output, "vomnibar-tabs-scroll.png") });
  await page.keyboard.press("Escape");
  await worker.evaluate(async (ids) => {
    await (globalThis as any).chrome.tabs.remove(ids);
  }, tabIds);
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Help dialog is React/Material and follows palette changes.
  await clickPage();
  await page.keyboard.press("?");
  const help = await (async () => {
    for (let i = 0; i < 60; i++) {
      const frame = page
        .frames()
        .find((item) => item.url().includes("/help.html"));
      if (frame) return frame;
      await page.waitForTimeout(100);
    }
    throw new Error("Help frame did not open");
  })();
  await help.locator(".help-row").first().waitFor({ timeout: 15000 });
  assert((await help.locator(".help-row").count()) > 20);
  const helpColors = await help.evaluate(() => ({
    primary: getComputedStyle(document.documentElement)
      .getPropertyValue("--md-sys-color-primary")
      .trim(),
    dialog: getComputedStyle(document.querySelector(".help-dialog")!)
      .backgroundColor,
  }));
  assert.equal(helpColors.primary, colors.accent);
  assert.equal(helpColors.dialog, rgb(colors.surface));
  await page.screenshot({ path: resolve(output, "help.png") });
  await page.keyboard.press("?");
  await page.waitForTimeout(500);

  // Find mode keeps its shortcut and HUD messages.
  await clickPage();
  await page.keyboard.press("/");
  const hud = await (async () => {
    for (let i = 0; i < 60; i++) {
      const frame = page
        .frames()
        .find((item) => item.url().includes("/hud.html"));
      if (frame) return frame;
      await page.waitForTimeout(100);
    }
    throw new Error("HUD frame did not open");
  })();
  const findInput = hud.locator(".hud-find-input");
  await findInput.waitFor({ timeout: 10000 });
  await page.keyboard.type("Vimium");
  await hud
    .locator(".hud-match-count")
    .filter({ hasText: "Match" })
    .waitFor({ timeout: 10000 });
  const hudColors = await hud.evaluate(() => ({
    background: getComputedStyle(document.querySelector(".hud")!)
      .backgroundColor,
    count: document.querySelector(".hud-match-count")?.textContent,
  }));
  assert.equal(hudColors.background, rgb(colors.surface));
  assert.match(hudColors.count ?? "", /Match/);
  await page.screenshot({ path: resolve(output, "hud.png") });
  await page.keyboard.press("Escape");

  // Upstream options page inherits the palette through the shared page theme.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/pages/options.html`, {
    waitUntil: "domcontentloaded",
  });
  await options.waitForFunction(
    () => getComputedStyle(document.body).backgroundColor === "rgb(17, 19, 24)",
    undefined,
    { timeout: 10000 },
  );
  const optionColors = await options.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    input: getComputedStyle(document.querySelector("textarea")!)
      .backgroundColor,
    primary: getComputedStyle(document.documentElement)
      .getPropertyValue("--md-sys-color-primary")
      .trim(),
  }));
  assert.equal(optionColors.body, rgb(colors.background));
  assert.equal(optionColors.text, rgb(colors.foreground));
  assert.equal(optionColors.input, rgb(colors.surface));
  assert.equal(optionColors.primary, colors.accent);
  await options.screenshot({ path: resolve(output, "options.png") });

  const report = {
    hintColors,
    vomnibarColors,
    helpColors,
    hudColors,
    optionColors,
  };
  await Bun.write(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Vimium compatibility: shortcuts and palette checks passed.");
} finally {
  await context.close();
  server.stop(true);
}
