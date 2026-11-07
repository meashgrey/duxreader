import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { parseColor, luminance } from "../../../../lib/color-roles";
import type { SiteCase } from "../../types.mts";

export default {
  id: "github-profile",
  url: "https://github.com/meashgrey",
  async run({ page, output, setEnabled, setTheme }) {
    const section = page.locator(".js-yearly-contributions");
    await section.waitFor();
    await section.scrollIntoViewIfNeeded();
    const graph = page.locator(".activity-overview-box");
    await graph.scrollIntoViewIfNeeded();
    const snapshot = () =>
      page.evaluate(() => ({
        levels: [0, 1, 2, 3, 4].map((level) => {
          const node = document.querySelector(
            `[id="contribution-graph-legend-level-${level}"]`,
          );
          return node ? getComputedStyle(node).backgroundColor : null;
        }),
        days: [
          ...document.querySelectorAll<HTMLElement>(
            ".ContributionCalendar-day[data-date]",
          ),
        ].map((node) => ({
          date: node.dataset.date,
          level: Number(node.dataset.level),
          color: getComputedStyle(node).backgroundColor,
        })),
        radar: [
          ...document.querySelectorAll<SVGElement>(
            ".js-activity-overview-graph .js-highlight-blob,.js-activity-overview-graph .activity-overview-axis,.js-activity-overview-graph .activity-overview-point",
          ),
        ].map((node) => ({
          class: node.getAttribute("class"),
          fill: getComputedStyle(node).fill,
          stroke: getComputedStyle(node).stroke,
          shape: node.getAttribute("d"),
          opacity: getComputedStyle(node).opacity,
        })),
        bars: [
          ...document.querySelectorAll<HTMLElement>(
            '.contribution-activity-listing .Progress[role="img"] > .Progress-item',
          ),
        ].map((node) => ({
          width: node.style.width,
          color: getComputedStyle(node).backgroundColor,
        })),
        year: (() => {
          const node = document.querySelector(
            '.js-year-link[aria-current="true"]',
          );
          return node
            ? {
                fg: getComputedStyle(node).color,
                bg: getComputedStyle(node).backgroundColor,
              }
            : null;
        })(),
      }));
    await expect
      .poll(async () => (await snapshot()).bars.length, { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page
            .locator(".js-activity-overview-graph .js-highlight-blob")
            .getAttribute("d"),
        { timeout: 30000 },
      )
      .toBeTruthy();
    const before = await snapshot();
    assert(
      before.radar.length > 0,
      "The radar SVG must be present (even while GitHub lazily lays it out)",
    );
    await page.screenshot({ path: resolve(output, "disabled.png") });
    await setEnabled(true);
    await setTheme({
      mode: "dark",
      css: "",
      colors: {
        background: "#17121c",
        surface: "#312838",
        foreground: "#e8def8",
        accent: "#d0bcff",
      },
    });
    const after = await snapshot();
    assert.equal(
      new Set(after.levels).size,
      5,
      "All five calendar intensities must remain distinguishable",
    );
    assert.equal(after.levels[0], "rgb(49, 40, 56)");
    assert.equal(after.levels[4], "rgb(208, 188, 255)");
    assert(after.days.length > 0, "Calendar day cells must exist");
    assert(
      after.days.every((day) => day.color === after.levels[day.level]),
      "Calendar cells and legend must use the same intensity mapping",
    );
    assert.deepEqual(
      after.days.map(({ date, level }) => ({ date, level })),
      before.days.map(({ date, level }) => ({ date, level })),
      "Calendar dates and contribution levels must be preserved",
    );
    const accent = parseColor("#d0bcff")!;
    const distances = after.levels.map((value) => {
      const rgb = parseColor(value!)!;
      return Math.hypot(rgb.r - accent.r, rgb.g - accent.g, rgb.b - accent.b);
    });
    assert(
      distances.every((value, i) => i === 0 || value < distances[i - 1]!),
      "Calendar intensity must progress toward accent",
    );
    assert(
      after.radar.every((node) => node.stroke === "rgb(208, 188, 255)"),
      "Radar strokes must use theme accent",
    );
    assert(
      after.bars.every((node) => node.color === "rgb(208, 188, 255)"),
      "Repository bars must use theme accent",
    );
    assert.deepEqual(
      after.bars.map((node) => node.width),
      before.bars.map((node) => node.width),
      "Contribution bar lengths must be preserved",
    );
    assert.deepEqual(
      after.radar.map((node) => node.shape),
      before.radar.map((node) => node.shape),
      "Radar data geometry must remain unchanged",
    );
    assert.deepEqual(
      after.radar.map((node) => node.opacity),
      before.radar.map((node) => node.opacity),
      "Radar opacity must be preserved",
    );
    assert(after.year, "Selected year must exist");
    assert.equal(after.year.fg, "rgb(23, 18, 28)");
    const x = luminance(parseColor(after.year.fg)!),
      y = luminance(parseColor(after.year.bg)!);
    assert(
      (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) >= 4.5,
      "Selected-year text contrast is too low",
    );
    await page.screenshot({ path: resolve(output, "enabled.png") });
    await Bun.write(
      resolve(output, "comparison.json"),
      JSON.stringify({ before, after }, null, 2) + "\n",
    );
    return { before, after };
  },
} satisfies SiteCase;
