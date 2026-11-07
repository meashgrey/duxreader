export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n
    ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2
    : null;
};
export const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
    : null;
};

export function summarize(samples) {
  const groups = new Map();
  for (const sample of samples)
    for (const phase of sample.phases) {
      const key = `${sample.scenario}/${sample.enabled ? "enabled" : "disabled"}/${phase.phase}`;
      if (!groups.has(key)) groups.set(key, []);
      // Aggregate within each run first so a slow run is not diluted by pooling.
      groups.get(key).push({
        paintP95Ms: percentile(phase.paints, 0.95),
        slowEventMaxMs: phase.events.length
          ? Math.max(...phase.events.map((e) => e.duration))
          : 0,
        slowEventCount: phase.events.length,
        inputDelayMaxMs: phase.events.length
          ? Math.max(...phase.events.map((e) => e.inputDelay))
          : 0,
        longTaskCount: phase.longTasks.length,
        longTaskTotalMs: phase.longTasks.reduce((a, b) => a + b, 0),
        mainThreadBusyMs: phase.mainThreadBusyMs,
        styleMs: phase.styleMs,
        styleRecalcs: phase.styleRecalcs,
        browserCpuPercent: phase.browserCpuPercent,
        heapUsedMiB: phase.heapUsedBytes / 1024 ** 2,
        generatedCssKiB:
          typeof phase.generatedCssBytes === "number"
            ? phase.generatedCssBytes / 1024
            : null,
        browserRssMiB:
          phase.browserRssBytes === null
            ? null
            : phase.browserRssBytes / 1024 ** 2,
      });
    }
  return Object.fromEntries(
    [...groups].map(([key, runs]) => [
      key,
      {
        runs: runs.length,
        ...Object.fromEntries(
          Object.keys(runs[0]).map((metric) => [
            metric,
            median(runs.map((r) => r[metric]).filter((v) => v !== null)),
          ]),
        ),
      },
    ]),
  );
}

// Both a relative and an absolute increase are required. Shared CI runners
// cannot support millisecond-perfect gates. CPU, RSS, and RAF callback timing
// remain advisory; RAF phasing can diverge from actual Event Timing latency.
export const budgets = {
  slowEventMaxMs: { ratio: 1.35, increase: 32, ceiling: 200 },
  inputDelayMaxMs: { ratio: 1.35, increase: 16, ceiling: 100 },
  mainThreadBusyMs: { ratio: 1.35, increase: 150 },
  styleRecalcs: { ratio: 1.35, increase: 20 },
  heapUsedMiB: { ratio: 1.25, increase: 8 },
  generatedCssKiB: { ratio: 1.25, increase: 64 },
};

export function regressions(current, baseline) {
  const failures = [];
  for (const [key, values] of Object.entries(current.summary)) {
    if (!key.includes("/enabled/")) continue;
    if (values.runs < 3)
      failures.push(`${key}: checks require at least three runs`);
    if (baseline && !baseline.summary[key])
      failures.push(`${key}: missing baseline`);
    for (const [metric, budget] of Object.entries(budgets)) {
      const increase =
        metric === "mainThreadBusyMs" && key.endsWith("/open-focus")
          ? 40
          : budget.increase;
      const now = values[metric],
        before = baseline?.summary[key]?.[metric];
      if (now === null) continue;
      if (budget.ceiling && now > budget.ceiling)
        failures.push(
          `${key} ${metric}: ${now.toFixed(2)} exceeds ${budget.ceiling}`,
        );
      if (
        before != null &&
        now > before * budget.ratio &&
        now - before > increase
      )
        failures.push(
          `${key} ${metric}: ${before.toFixed(2)} -> ${now.toFixed(2)}`,
        );
    }
  }
  return failures;
}

export function markdown(report, failures, baseline) {
  const fmt = (v) => (v == null ? "n/a" : v.toFixed(1));
  return [
    "# Interaction benchmark",
    "",
    `Browser: ${report.browser}. Runs per case: ${report.runs}. Production extension with trusted keyboard/pointer input.`,
    "",
    "| Case | Event-to-two-RAF p95 ms (advisory) | Slow event max ms | Long tasks | Main-thread busy ms | Browser CPU % | JS heap MiB | Browser RSS MiB |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(report.summary).map(
      ([key, v]) =>
        `| ${key} | ${fmt(v.paintP95Ms)} | ${fmt(v.slowEventMaxMs)} | ${fmt(v.longTaskCount)} | ${fmt(v.mainThreadBusyMs)} | ${fmt(v.browserCpuPercent)} | ${fmt(v.heapUsedMiB)} | ${fmt(v.browserRssMiB)} |`,
    ),
    "",
    "Medians of per-run metrics. Two RAF callbacks are advisory and are not INP or proof of an intervening paint. Event Timing only reports events >=16 ms; raw durations and input delays are in report.json. CPU covers the entire browser; 100% is one core. Heap is the page target's uncollected JS heap. RSS sums browser processes and double-counts shared pages. Neither is a leak test.",
    "",
    baseline
      ? "Compared against the supplied baseline with the same browser and workload."
      : "No PR baseline supplied; only absolute budgets can be checked.",
    "",
    ...(failures.length
      ? ["## Budget failures", "", ...failures.map((f) => `- ${f}`)]
      : [
          report.check?.requested
            ? "No budget failures."
            : "Budget checks were not requested.",
        ]),
    "",
  ].join("\n");
}
