import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const output = resolve(process.env.DUX_PERF_OUTPUT ?? ".temp/interaction");
export default defineConfig({
  testDir: "./benchmarks/interaction",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0, // Retrying until a fast sample passes would conceal regressions.
  repeatEach: Number(process.env.DUX_PERF_RUNS ?? 3),
  timeout: 90_000,
  globalTimeout: 10 * 60_000,
  outputDir: resolve(output, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(output, "playwright.json") }],
    ["html", { outputFolder: resolve(output, "html"), open: "never" }],
  ],
  projects: [{ name: "disabled" }, { name: "enabled" }],
});
