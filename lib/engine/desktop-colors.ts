import {
  neutral,
  luminance,
  parseColor,
  sameColor,
  type RGB,
} from "../color-roles";
import type { Theme } from "../theme";
export type PaletteRole = "background" | "text" | "border";

// Only final RGB values differ from upstream. No selectors, DOM queries, or
// event handlers belong in the color policy. Alpha always comes from the page.
export function mapDesktopColor(
  source: RGB,
  role: PaletteRole,
  palette:
    | (Pick<Theme, "colors" | "material"> & { sourceBackground?: RGB })
    | undefined,
): RGB | undefined {
  if (!palette) return;
  const { colors, material = {} } = palette;
  const isNeutral = neutral(source);
  // Keep semantic red/green/yellow colors on upstream's contrast-aware path.
  const isBlue = source.b > source.r * 1.15 && source.b > source.g * 1.1;
  let value: string;
  if (role === "background") {
    value =
      palette.sourceBackground && sameColor(source, palette.sourceBackground)
        ? colors.background
        : isNeutral
          ? luminance(source) > 0.98 || luminance(source) < 0.002
            ? colors.background
            : colors.surface
          : isBlue
            ? // Accent is a foreground/control role. Using it for large
              // colored backgrounds makes white text unreadable whenever the
              // palette accent is light. Keep colored backdrops on a surface.
              colors.surface
            : "";
  } else if (role === "border") {
    value = isNeutral ? (material["outline-variant"] ?? colors.surface) : "";
  } else {
    value = isNeutral ? colors.foreground : isBlue ? colors.accent : "";
  }
  const target = value && parseColor(value);
  return target ? { ...target, a: source.a } : undefined;
}
