import type { ColorMap } from "../color-map.mts";

export interface SiteRules {
  readonly hostnames: readonly string[];
  readonly paths?: readonly RegExp[];
  readonly preserveInline?: readonly string[];
  readonly colorMap?: readonly ColorMap[];
}
