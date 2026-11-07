import { expect, test } from "bun:test";
import { verifyUpstream } from "../scripts/vimium/upstream.mts";
import { VIMIUM_VERSION } from "../lib/vimium/version.ts";

test("Vimium uses the clean, pinned upstream submodule", async () => {
  const upstream = await verifyUpstream();
  const entry = Bun.spawnSync(["git", "ls-files", "--stage", "vendor/vimium"]);
  expect(entry.exitCode).toBe(0);
  expect(entry.stdout.toString().trim()).toBe(
    `160000 ${upstream.revision} 0\tvendor/vimium`,
  );
  expect(await Bun.file("public/third-party/vimium-MIT.txt").text()).toBe(
    await Bun.file("vendor/vimium/MIT-LICENSE.txt").text(),
  );
  expect(VIMIUM_VERSION).toBe(upstream.version);
});

test("generated Vimium content scripts use the React overlay pages", async () => {
  const content = await Bun.file("public/vimium/content.js").text();
  expect(content).toContain('this.vomnibarUI.load("vomnibar.html"');
  expect(content).toContain("hud.html${queryString}");
  expect(content).toContain('this.helpUI.load("help.html"');
  expect(content).not.toContain("pages/vomnibar_page.html");
  expect(content).not.toContain("pages/hud_page.html");
  expect(content).not.toContain("pages/help_dialog_page.html");
  expect(content).toContain('startsWith("moz-extension://")');
  expect(content).toContain("globalThis.chrome = globalThis.browser");
});

test("extension pages load the Firefox API alias before their entrypoints", async () => {
  for (const [page, entrypoint] of [
    ["options", "../vimium/preferences.js"],
    ["command_listing", "command_listing.js"],
    ["doc_search_completion", "doc_search_completion.js"],
  ]) {
    const html = await Bun.file(`public/pages/${page}.html`).text();
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(scripts[0]).toBe("../vimium/firefox-api.js");
    expect(scripts).toContain(entrypoint);
  }
});

test("Vimium background tolerates Duxreader runtime messages", async () => {
  const background = await Bun.file("lib/vimium/background.js").text();
  expect(background).toContain(
    'content_scripts.find((entry) => entry.js?.includes("vimium/content.js"))',
  );
  expect(background).toContain("if (request.handler == null)");
  expect(background).not.toContain("../icons/action_");
  expect(background).toContain("icons/action_enabled_16.png");
  expect(background).toContain("chrome.action ?? chrome.browserAction");
});

test("an uninitialized Vimium dependency gives an actionable error", async () => {
  await expect(verifyUpstream("vendor")).rejects.toThrow(
    "git submodule update --init --recursive",
  );
});
