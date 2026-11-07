import { luminance, parseColor } from "../../lib/color-roles";
import type { Theme } from "../../lib/theme";

export type ThemeColorTarget = keyof Theme["colors"];
const targets = new Set<ThemeColorTarget>([
  "background",
  "surface",
  "foreground",
  "accent",
]);
const properties = [
  "background-color",
  "color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "accent-color",
  "fill",
  "stroke",
] as const;
export interface ColorMap {
  readonly selector: string;
  readonly property: (typeof properties)[number];
  readonly target: ThemeColorTarget;
  readonly mix?: { readonly with: ThemeColorTarget; readonly weight: number };
  readonly contrastAgainst?: ThemeColorTarget;
}

// Emit ordinary CSS once per theme application. The browser handles matching,
// new nodes, and interaction states without sampling computed colors on input.
export function compileColorMaps(
  maps: readonly ColorMap[],
  colors: Theme["colors"],
): string {
  const color = (role: ThemeColorTarget) => {
    if (!targets.has(role))
      throw new Error(`Unknown theme color target: ${role}`);
    const value = colors[role];
    if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value))
      throw new Error(`Invalid theme color: ${role}`);
    return value;
  };
  const contrast = (a: string, b: string) => {
    const x = luminance(parseColor(a)!),
      y = luminance(parseColor(b)!);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  return maps
    .map((map) => {
      let value = color(map.target);
      if (!(properties as readonly string[]).includes(map.property))
        throw new Error(`Unsupported color property: ${map.property}`);
      if (!map.selector.trim() || /[{}]/.test(map.selector))
        throw new Error("Invalid color-map selector");
      if (map.contrastAgainst !== undefined) {
        if (map.mix)
          throw new Error("Contrast text cannot also use a color mix");
        const against = color(map.contrastAgainst);
        value = [value, color("background"), color("foreground")].reduce(
          (best, candidate) =>
            contrast(candidate, against) > contrast(best, against)
              ? candidate
              : best,
        );
      }
      if (map.mix) {
        const other = color(map.mix.with),
          weight = map.mix.weight;
        if (!Number.isFinite(weight) || weight < 0 || weight > 100)
          throw new Error("Color mix weight must be between 0 and 100");
        value = `color-mix(in srgb, ${value} ${weight}%, ${other})`;
      }
      return `${map.selector}{${map.property}:${value}!important;}`;
    })
    .join("\n");
}
