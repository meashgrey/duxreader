import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { interactionPage, interactionScenarios } from "./fixture";

const theme = {
  mode: "dark",
  css: "",
  colors: {
    background: "#061003",
    surface: "#293426",
    foreground: "#d3ddcf",
    accent: "#a0cf93",
  },
};

for (const scenario of interactionScenarios) {
  test(scenario, async ({}, testInfo) => {
    const enabled = testInfo.project.name === "enabled";
    const extension = resolve(
      process.env.DUX_PERF_EXTENSION ?? ".output/chrome-mv3",
    );
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      viewport: { width: 1280, height: 800 },
      args: enabled
        ? [
            `--disable-extensions-except=${extension}`,
            `--load-extension=${extension}`,
          ]
        : [],
    });
    try {
      if (enabled) {
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker"));
        await worker.evaluate(async (value) => {
          // Seed the actual production extension, without a desktop/native host.
          await (globalThis as any).chrome.storage.local.set({
            theme: value,
            enabled: true,
            sourceMode: "file",
            sourcePath: "",
          });
        }, theme);
      }
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("http://benchmark.local/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: interactionPage(scenario),
        }),
      );
      await page.goto("http://benchmark.local/", { waitUntil: "load" });
      if (enabled) {
        await expect(page.locator(".card").last()).toHaveCSS(
          "background-color",
          "rgb(6, 16, 3)",
        );
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          "rgb(6, 16, 3)",
        );
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      const browserCDP = await context.browser()!.newBrowserCDPSession();
      async function snapshot() {
        const { metrics } = await cdp.send("Performance.getMetrics");
        const { processInfo } = await browserCDP.send(
          "SystemInfo.getProcessInfo",
        );
        let rssBytes: number | null = null;
        if (process.platform === "linux") {
          // Summed RSS includes shared pages more than once; it is not PSS.
          const rss = await Promise.all(
            processInfo.map(async (p) => {
              try {
                const text = await readFile(`/proc/${p.id}/status`, "utf8");
                return Number(/^VmRSS:\s+(\d+)/m.exec(text)?.[1] ?? 0) * 1024;
              } catch {
                return 0;
              }
            }),
          );
          rssBytes = rss.reduce((a, b) => a + b, 0);
        }
        return {
          metrics: Object.fromEntries(metrics.map((m) => [m.name, m.value])),
          processInfo,
          rssBytes,
          at: performance.now(),
        };
      }
      const entry = page.locator("#entry");
      // Finish startup before measuring first open/focus as a separate phase.
      await page.waitForTimeout(2000);
      const generated = await page.evaluate(() => {
        const texts = [
          ...document.querySelectorAll<HTMLStyleElement>(
            "style[data-duxreader-sheet],style.darkreader",
          ),
        ].map((s) =>
          s.sheet
            ? [...s.sheet.cssRules].map((r) => r.cssText).join("\n")
            : (s.textContent ?? ""),
        );
        return {
          generatedCssBytes: texts.reduce((n, s) => n + s.length, 0),
          projectedTokens: texts.reduce(
            (n, s) =>
              n +
              (
                s.match(
                  /--(?:dux-value-|darkreader-(?:bg|text|border|background))/g,
                ) ?? []
              ).length,
            0,
          ),
        };
      });
      if (
        enabled &&
        scenario === "variables" &&
        process.env.DUX_PERF_CHECK === "1"
      ) {
        expect(
          generated.generatedCssBytes,
          "Unused variables must not inflate generated CSS",
        ).toBeLessThan(250_000);
        expect(
          generated.projectedTokens,
          "Only demanded role projections should be emitted",
        ).toBeLessThan(1000);
      }
      const phases = [];
      for (const phase of ["open-focus", "typing", "hover", "idle"]) {
        await page.evaluate(() => {
          const s = (window as any).perfSample;
          s.events = [];
          s.longTasks = [];
          s.paints = [];
          s.trustedInputs = 0;
        });
        const before = await snapshot();
        if (phase === "open-focus") {
          await page.locator("#open").click();
          await expect(entry).toBeFocused();
          if (scenario === "editor") await page.keyboard.press("Home");
        } else if (phase === "typing") {
          // Sequential trusted key events at human cadence, not fill() or dispatchEvent().
          await page.keyboard.type("benchmarktypingwithdesktopcolors", {
            delay: 40,
          });
          await page.keyboard.press("Backspace");
        } else if (phase === "hover") {
          for (let i = 0; i < 18; i++) {
            await page
              .locator(".card")
              .nth(i % 3)
              .hover();
            await page.waitForTimeout(40);
          }
          if (enabled)
            await expect(page.locator(".card").nth(2)).toHaveCSS(
              "background-color",
              "rgb(41, 52, 38)",
            );
        } else await page.waitForTimeout(2000);
        await page.waitForTimeout(250); // Deliver Event Timing and final paints.
        const after = await snapshot();
        const observations = await page.evaluate(
          () => (window as any).perfSample,
        );
        const elapsed = (after.at - before.at) / 1000;
        const delta = (name: string) =>
          (after.metrics[name] ?? 0) - (before.metrics[name] ?? 0);
        const oldProcesses = new Map(
          before.processInfo.map((p) => [p.id, p.cpuTime]),
        );
        const cpuSeconds = after.processInfo.reduce(
          (sum, p) =>
            sum + Math.max(0, p.cpuTime - (oldProcesses.get(p.id) ?? 0)),
          0,
        );
        phases.push({
          phase,
          elapsedSeconds: elapsed,
          mainThreadBusyMs: delta("TaskDuration") * 1000,
          scriptMs: delta("ScriptDuration") * 1000,
          styleMs: delta("RecalcStyleDuration") * 1000,
          styleRecalcs: delta("RecalcStyleCount"),
          layouts: delta("LayoutCount"),
          browserCpuPercent: (cpuSeconds / elapsed) * 100,
          heapUsedBytes: after.metrics.JSHeapUsedSize,
          browserRssBytes: after.rssBytes,
          ...generated,
          ...observations,
        });
        if (phase === "typing") {
          if (
            enabled &&
            scenario === "variables" &&
            process.env.DUX_PERF_CHECK === "1"
          ) {
            expect(
              await page.locator("html").getAttribute("data-duxreader-node"),
            ).toBeNull();
            expect(await entry.getAttribute("data-duxreader-node")).toBeNull();
            expect(
              await entry.getAttribute("data-darkreader-inline-bgcolor"),
            ).toBeNull();
            expect(
              await entry.evaluate((element) =>
                [...(element as HTMLElement).style].filter(
                  (name) =>
                    name.startsWith("--darkreader-") &&
                    name.includes("bench-layout"),
                ),
              ),
            ).toEqual([]);
          }
          expect(observations.trustedInputs).toBe(
            "benchmarktypingwithdesktopcolors".length + 1,
          );
          expect(observations.paints).toHaveLength(
            "benchmarktypingwithdesktopcolors".length + 1,
          );
        }
        if (phase === "open-focus" || phase === "hover")
          expect(observations.paints.length).toBeGreaterThan(0);
      }
      expect(errors).toEqual([]);
      await testInfo.attach("metrics", {
        body: JSON.stringify({
          scenario,
          enabled,
          repeat: testInfo.repeatEachIndex,
          browser: context.browser()!.version(),
          phases,
        }),
        contentType: "application/json",
      });
      // Performance traces add overhead. Collect them in a separate diagnostic run.
      if (process.env.DUX_PERF_TRACE === "1") {
        const trace: any[] = [];
        cdp.on("Tracing.dataCollected", ({ value }) => trace.push(...value));
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline,v8.execute,blink.user_timing",
          options: "sampling-frequency=10000",
        });
        await page.keyboard.type("diagnostictyping", { delay: 40 });
        const complete = new Promise<void>((resolve) =>
          cdp.once("Tracing.tracingComplete", () => resolve()),
        );
        await cdp.send("Tracing.end");
        await complete;
        await testInfo.attach("chrome-trace", {
          body: JSON.stringify({ traceEvents: trace }),
          contentType: "application/json",
        });
      }
    } finally {
      await context.close();
    }
  });
}
