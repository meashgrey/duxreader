import type { ColorMap } from "../../color-map.mts";

// GitHub's React text inputs draw their focus border on the wrapper rather
// than the native input. Keep that focus ring on the theme accent instead of
// GitHub's default blue, which is not part of the desktop palette.
export default [
  {
    selector: ".TextInput-wrapper:focus-within",
    property: "border-color",
    target: "accent",
  },
  {
    selector: ".TextInput-wrapper:focus-within",
    property: "outline-color",
    target: "accent",
  },
] as const satisfies readonly ColorMap[];
