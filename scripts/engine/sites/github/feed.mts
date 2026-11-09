import type { ColorMap } from "../../color-map.mts";

// The feed page paints a full-width backdrop behind its cards. GitHub derives
// that backdrop from --dashboard-bgColor (usually --bgColor-inset), which is
// not a page surface in the desktop palette. Keep it on the base background.
export default [
  {
    selector: ".feed-background",
    property: "background-color",
    target: "background",
  },
] as const satisfies readonly ColorMap[];
