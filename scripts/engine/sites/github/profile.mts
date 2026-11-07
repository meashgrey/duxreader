import type { ColorMap } from "../../color-map.mts";

const calendar: ColorMap[] = [0, 1, 2, 3, 4].flatMap((level) => {
  const selector = `.ContributionCalendar-day[data-level="${level}"]`;
  return (["background-color", "fill"] as const).map((property) => ({
    selector,
    property,
    target: level === 0 ? ("surface" as const) : ("accent" as const),
    ...(level > 0 && level < 4
      ? { mix: { with: "surface" as const, weight: level * 25 } }
      : {}),
  }));
});
const graph = ".js-activity-overview-graph";
const selectedYear = '.js-year-link:is(.selected, [aria-current="true"])';
export default [
  ...calendar,
  {
    selector: `${graph} .js-highlight-blob`,
    property: "fill",
    target: "accent",
  },
  {
    selector: `${graph} .js-highlight-blob, ${graph} .activity-overview-axis, ${graph} .activity-overview-point`,
    property: "stroke",
    target: "accent",
  },
  {
    selector: `${graph} .activity-overview-point`,
    property: "fill",
    target: "background",
  },
  {
    selector: `${graph} .activity-overview-label, ${graph} .activity-overview-percentage`,
    property: "fill",
    target: "foreground",
  },
  {
    selector:
      '.contribution-activity-listing .Progress[role="img"] > .Progress-item',
    property: "background-color",
    target: "accent",
  },
  { selector: selectedYear, property: "background-color", target: "accent" },
  {
    selector: selectedYear,
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  },
] satisfies readonly ColorMap[];
