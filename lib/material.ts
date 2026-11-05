import type { Theme } from "./theme";

// Compatibility for older four-color theme files. New Matugen templates provide
// every role explicitly; no client-side seed-color generation replaces them.
export function materialRoles(theme: Theme): Record<string, string> {
  const { background, surface, foreground, accent } = theme.colors;
  const channels = accent
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  const luminance =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  const onAccent = luminance > 0.179 ? "#000000" : "#ffffff";
  return {
    primary: accent,
    "on-primary": onAccent,
    "primary-container": surface,
    "on-primary-container": foreground,
    secondary: accent,
    "on-secondary": onAccent,
    "secondary-container": surface,
    "on-secondary-container": foreground,
    surface: background,
    "on-surface": foreground,
    "surface-container": surface,
    "surface-container-low": surface,
    "surface-container-high": surface,
    "surface-container-highest": surface,
    "surface-container-lowest": background,
    "surface-variant": surface,
    "on-surface-variant": foreground,
    outline: foreground,
    "outline-variant": foreground,
    error: accent,
    "on-error": onAccent,
    "error-container": surface,
    "on-error-container": foreground,
    ...theme.material,
  };
}
