import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import type { SiteCase } from "../tests/sites/types.mts";

type WorkerAPI = {
  chrome: {
    storage: { local: { set(value: Record<string, unknown>): Promise<void> } };
  };
};
const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    url: { type: "string" },
    list: { type: "boolean" },
    output: { type: "string", default: ".temp/sites" },
    extension: { type: "string", default: ".output/chrome-mv3" },
  },
});
const files: string[] = [];
for await (const file of new Bun.Glob("**/*.site.mts").scan(
  "tests/sites/cases",
))
  files.push(file);
const cases: SiteCase[] = [];
for (const file of files.sort())
  cases.push(
    (await import(pathToFileURL(resolve("tests/sites/cases", file)).href))
      .default as SiteCase,
  );
assert.equal(
  new Set(cases.map((site) => site.id)).size,
  cases.length,
  "Site IDs must be unique",
);
if (values.list) {
  console.log(cases.map((site) => `${site.id}\t${site.url}`).join("\n"));
  process.exit(0);
}
for (const id of values.site ?? [])
  assert(
    cases.some((site) => site.id === id),
    `Unknown site: ${id}`,
  );
const selected = values.site?.length
  ? cases.filter((site) => values.site!.includes(site.id))
  : cases;
assert(selected.length > 0, "No site cases found");
assert(
  !values.url || selected.length === 1,
  "--url requires exactly one --site",
);
const output = resolve(values.output!);
const extension = resolve(values.extension!);
assert(
  await Bun.file(resolve(extension, "manifest.json")).exists(),
  "Run bun run build first",
);
await mkdir(output, { recursive: true });
const results: Record<string, unknown>[] = [];
for (const site of selected) {
  const directory = resolve(output, site.id);
  await mkdir(directory, { recursive: true });
  const target = new URL(values.url ?? site.url);
  assert.equal(target.protocol, "https:");
  let context:
    Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  let page: Page | undefined;
  const record: Record<string, unknown> = {
    site: site.id,
    url: target.href,
    passed: false,
  };
  try {
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      viewport: { width: 1440, height: 1100 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    record.browser = context.browser()!.version();
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async () => {
      await (globalThis as unknown as WorkerAPI).chrome.storage.local.set({
        enabled: false,
        sourceMode: "file",
        sourcePath: "",
        theme: {
          mode: "dark",
          css: "",
          colors: {
            background: "#111318",
            surface: "#1d2024",
            foreground: "#e1e2e9",
            accent: "#a8c8ff",
          },
        },
      });
    });
    page = await context.newPage();
    const navigation = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    record.httpStatus = navigation?.status();
    record.finalURL = page.url();
    record.title = await page.title();
    Object.assign(
      record,
      await site.run({
        page,
        output: directory,
        async setEnabled(enabled) {
          await worker.evaluate(async (enabled) => {
            await (globalThis as unknown as WorkerAPI).chrome.storage.local.set(
              { enabled },
            );
          }, enabled);
          if (enabled)
            await page!.waitForFunction(
              () =>
                document.documentElement.dataset.darkreaderMode === "dynamic",
            );
          await page!.waitForTimeout(6000);
        },
      }),
      { passed: true },
    );
  } catch (error) {
    record.error = String(error);
    if (page) {
      record.finalURL = page.url();
      record.title = await page.title().catch(() => "unavailable");
      await Bun.write(
        resolve(directory, "failure.html"),
        await page.content().catch(() => ""),
      );
      await page
        .screenshot({ path: resolve(directory, "failure.png"), timeout: 5000 })
        .catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await context?.close();
    results.push(record);
    await Bun.write(
      resolve(directory, "report.json"),
      JSON.stringify(record, null, 2) + "\n",
    );
    console.log(
      `${record.passed ? "PASS" : "FAIL"} ${site.id}: ${record.error ?? target.href}`,
    );
  }
}
await Bun.write(
  resolve(output, "report.json"),
  JSON.stringify({ created: new Date().toISOString(), results }, null, 2) +
    "\n",
);
console.log(`Site reports: ${output}`);
