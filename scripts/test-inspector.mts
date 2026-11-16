import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const build = await Bun.build({
  entrypoints: ["tests/browser/inspector-fixture.ts"],
  target: "browser",
  format: "iife",
});
if (!build.success)
  throw new AggregateError(build.logs, "Inspector fixture build failed");
const code = await build.outputs[0]!.text();

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body></body>",
    }),
  );
  await page.goto("http://duxreader.test/");
  await page.addScriptTag({ content: code });
  const result = await page.waitForFunction(
    () => (window as any).__inspectorResult,
    undefined,
    { timeout: 15000 },
  );
  const value = (await result.jsonValue()) as {
    ok: boolean;
    checks: string[];
    error?: string;
  };
  if (!value.ok)
    throw new Error(
      `${value.error ?? "Inspector checks failed"}\nPassed: ${value.checks.join("; ")}`,
    );
  console.log(`Inspector selector: ${value.checks.length} checks passed.`);
  for (const check of value.checks) console.log(`  - ${check}`);
} finally {
  await browser.close();
}
