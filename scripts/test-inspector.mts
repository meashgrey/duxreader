import { resolve } from "node:path";
import { chromium } from "@playwright/test";

interface FixtureResult {
  ok: boolean;
  checks: string[];
  error?: string;
}

async function runFixture(
  page: import("@playwright/test").Page,
  name: string,
  entrypoint: string,
  key: string,
) {
  const build = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "iife",
  });
  if (!build.success)
    throw new AggregateError(build.logs, `${name} fixture build failed`);
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body></body>",
    }),
  );
  await page.goto("http://duxreader.test/");
  await page.addScriptTag({ content: await build.outputs[0]!.text() });
  const handle = await page.waitForFunction(
    (key) => (window as never as Record<string, FixtureResult | undefined>)[key],
    key,
    { timeout: 20000 },
  );
  const value = (await handle.jsonValue()) as FixtureResult;
  if (!value.ok)
    throw new Error(
      `${value.error ?? `${name} checks failed`}\nPassed: ${value.checks.join("; ")}`,
    );
  console.log(`${name}: ${value.checks.length} checks passed.`);
  for (const check of value.checks) console.log(`  - ${check}`);
}

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage();
  await runFixture(
    page,
    "Inspector selector",
    resolve("tests/browser/inspector-fixture.ts"),
    "__inspectorResult",
  );
  await runFixture(
    page,
    "Inspector picker",
    resolve("tests/browser/picker-fixture.ts"),
    "__pickerResult",
  );
  await runFixture(
    page,
    "Inspector preserve",
    resolve("tests/browser/preserve-fixture.ts"),
    "__preserveResult",
  );
  await runFixture(
    page,
    "Inspector layers",
    resolve("tests/browser/layers-fixture.ts"),
    "__layersResult",
  );
} finally {
  await browser.close();
}
