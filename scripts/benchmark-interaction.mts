import { resolve } from "node:path";
import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { interactionScenarios } from "../benchmarks/interaction/fixture.ts";
import {
  summarize,
  regressions,
  markdown,
  budgets,
  type InteractionSample,
} from "./lib/performance-report.mts";

const args = process.argv.slice(2);
const allowed = new Set([
  "--output",
  "--extension",
  "--runs",
  "--baseline",
  "--trace",
  "--check",
]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i]!)) throw new Error(`Unknown argument: ${args[i]!}`);
  if (!["--check", "--trace"].includes(args[i]!)) {
    if (!args[i + 1] || args[i + 1]!.startsWith("--"))
      throw new Error(`Missing value for ${args[i]!}`);
    i++;
  }
}
const option = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const runs = Number(option("--runs", "3"));
if (!Number.isInteger(runs) || runs < 1 || runs > 20)
  throw new Error("Use 1-20 runs");
const output = resolve(option("--output", ".temp/interaction")!);
const extension = resolve(option("--extension", ".output/chrome-mv3")!);
if (!(await Bun.file(resolve(extension, "manifest.json")).exists()))
  throw new Error("Build the production extension first: bun run build");
if (args.includes("--trace") && args.includes("--check"))
  throw new Error(
    "Collect diagnostic traces separately from regression checks",
  );
await mkdir(output, { recursive: true });
const runner = Bun.spawn(
  [
    process.execPath,
    "./node_modules/@playwright/test/cli.js",
    "test",
    "-c",
    "playwright.performance.config.ts",
  ],
  {
    env: {
      ...process.env,
      DUX_PERF_RUNS: String(runs),
      DUX_PERF_OUTPUT: output,
      DUX_PERF_EXTENSION: extension,
      DUX_PERF_TRACE: args.includes("--trace") ? "1" : "0",
      DUX_PERF_CHECK: args.includes("--check") ? "1" : "0",
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
const exit = await runner.exited;
if (exit) process.exit(exit); // Never treat incomplete/error runs as a baseline.
const results = await Bun.file(resolve(output, "playwright.json")).json();
const samples: InteractionSample[] = [];
interface ReportSuite {
  suites?: ReportSuite[];
  specs?: {
    tests: {
      results: {
        attachments?: { name: string; path?: string; body?: string }[];
      }[];
    }[];
  }[];
}
async function collect(suites: ReportSuite[]) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests)
        for (const result of test.results) {
          for (const attachment of result.attachments ?? [])
            if (attachment.name === "metrics") {
              samples.push(
                attachment.path
                  ? await Bun.file(attachment.path).json()
                  : JSON.parse(
                      Buffer.from(attachment.body!, "base64").toString(),
                    ),
              );
            }
        }
    await collect(suite.suites ?? []);
  }
}
await collect(results.suites);
if (samples.length !== runs * interactionScenarios.length * 2)
  throw new Error(
    `Incomplete metrics: expected ${runs * interactionScenarios.length * 2}, received ${samples.length}`,
  );
const hash = createHash("sha256");
for (const file of [
  "benchmarks/interaction/fixture.ts",
  "benchmarks/interaction/interaction.spec.ts",
])
  hash.update(await Bun.file(file).text());
const report = {
  schema: 1,
  gatePolicy: "native-event-v2",
  created: new Date().toISOString(),
  runs,
  browser: samples[0]!.browser,
  workloadHash: hash.digest("hex"),
  environment: {
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    bun: Bun.version,
  },
  extension,
  budgets,
  summary: summarize(samples),
  samples,
  check: undefined as
    | { requested: boolean; baseline: string | null; failures: string[] }
    | undefined,
};
const baselinePath = option("--baseline");
const baseline = baselinePath
  ? await Bun.file(resolve(baselinePath)).json()
  : undefined;
if (
  baseline &&
  (baseline.schema !== report.schema ||
    baseline.browser !== report.browser ||
    baseline.workloadHash !== report.workloadHash ||
    baseline.environment.platform !== report.environment.platform ||
    baseline.environment.arch !== report.environment.arch)
)
  throw new Error(
    "Baseline is incompatible: use the same harness, browser, platform, and architecture",
  );
const failures = args.includes("--check") ? regressions(report, baseline) : [];
report.check = {
  requested: args.includes("--check"),
  baseline: baselinePath ?? null,
  failures,
};
await Bun.write(
  resolve(output, "report.json"),
  JSON.stringify(report, null, 2),
);
const summary = markdown(report, failures, baseline);
await Bun.write(resolve(output, "summary.md"), summary);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
if (failures.length) process.exitCode = 1;
