import type { ColorMap } from "../../color-map.mts";

// GitHub paints merged labels with bgColor-done-emphasis. The renderer maps
// that background to the accent role, but leaves fgColor-onEmphasis on the
// foreground role, producing light text on a light accent surface. Choose the
// palette color with the strongest contrast against the accent instead.
export default [
  {
    selector: '[data-status="pullMerged"]',
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  },
  {
    selector: ".State--merged",
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  },
  {
    // The merge event badge paints a done-emphasis circle and inherits the
    // icon color from the same on-emphasis text role.
    selector: '[class*="color-bg-done-emphasis"] > svg',
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  },
  {
    selector: '[data-testid="mergeability-icon-wrapper"] svg',
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  }
] as const satisfies readonly ColorMap[];
