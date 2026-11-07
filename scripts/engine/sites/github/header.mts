import type { ColorMap } from "../../color-map.mts";

export default [
  {
    // GlobalNav is the current signed-in shell. Retain older wrappers and
    // public header variants without changing the shared bgColor-inset token.
    selector:
      '.header-wrapper, header.GlobalNav, .AppHeader, .AppHeader-globalBar, .AppHeader-localBar, header[role="banner"], .Header',
    property: "background-color",
    target: "background",
  },
] as const satisfies readonly ColorMap[];
