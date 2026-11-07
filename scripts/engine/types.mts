import type { RGB } from "../../lib/color-roles";
import type { mapDesktopColor } from "../../lib/engine/desktop-colors";

// Extend the pinned upstream public theme contract with our output policy data.
// These fields also participate in the upstream rule/color cache key.
export type EngineTheme = DarkReader.Theme & {
  duxPalette?: string;
  duxColors?: Parameters<typeof mapDesktopColor>[2];
};
export type ColorRole = "background" | "text" | "border";

// Upstream treats an absent alpha channel as fully opaque.
export type EngineColor = Omit<RGB, "a"> & { a?: number };
