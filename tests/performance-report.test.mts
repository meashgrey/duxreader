import { expect, test } from "bun:test";
import {
  median,
  type SummaryEntry,
  percentile,
  regressions,
} from "../scripts/lib/performance-report.mts";

test("performance medians and percentiles preserve slow samples", () => {
  expect(median([80, 10, 20])).toBe(20);
  expect(median([10, 20])).toBe(15);
  expect(percentile([10, 10, 10, 200], 0.95)).toBe(200);
  expect(percentile([], 0.95)).toBeNull();
});
test("performance gates require both relative and absolute regressions", () => {
  const report = (values: Partial<SummaryEntry>) => ({
    summary: { "input/enabled/typing": { runs: 3, ...values } },
  });
  const baseline = report({
    slowEventMaxMs: 48,
    mainThreadBusyMs: 500,
    heapUsedMiB: 20,
  });
  expect(
    regressions(
      report({ slowEventMaxMs: 64, mainThreadBusyMs: 660, heapUsedMiB: 27 }),
      baseline,
    ),
  ).toEqual([]);
  expect(
    regressions(
      report({ slowEventMaxMs: 96, mainThreadBusyMs: 800, heapUsedMiB: 32 }),
      baseline,
    ),
  ).toHaveLength(3);
  expect(regressions(report({ slowEventMaxMs: 201 }))).toHaveLength(1);
  expect(
    regressions({ summary: { "input/enabled/typing": { runs: 1 } } }),
  ).toHaveLength(1);
  expect(
    regressions(report({ slowEventMaxMs: 32 }), { summary: {} }),
  ).toHaveLength(1);
});
test("RAF phase changes are diagnostic while native delay and focus costs gate regressions", () => {
  const report = (values: Partial<SummaryEntry>) => ({
    summary: { "editor/enabled/typing": { runs: 3, ...values } },
  });
  expect(
    regressions(
      report({ paintP95Ms: 26, slowEventMaxMs: 48 }),
      report({ paintP95Ms: 7, slowEventMaxMs: 48 }),
    ),
  ).toEqual([]);
  expect(
    regressions(
      report({ inputDelayMaxMs: 50 }),
      report({ inputDelayMaxMs: 1 }),
    ),
  ).toHaveLength(1);
  expect(
    regressions(
      {
        summary: {
          "editor/enabled/open-focus": { runs: 3, mainThreadBusyMs: 100 },
        },
      },
      {
        summary: {
          "editor/enabled/open-focus": { runs: 3, mainThreadBusyMs: 20 },
        },
      },
    ),
  ).toHaveLength(1);
});
