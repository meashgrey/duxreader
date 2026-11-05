// Must match the registered Native Messaging manifest's name field.
export const HOST_NAME = "local.duxreader.bridge";
export const THEME_KEY = "theme";
export const ENABLED_KEY = "enabled";

// Shared wire format: the Rust bridge emits this shape and storage caches it.
export interface Theme {
  mode: "dark" | "light";
  colors: {
    background: string;
    surface: string;
    foreground: string;
    accent: string;
  };
  css: string;
}

export const defaultTheme: Theme = {
  mode: "dark",
  colors: {
    background: "#181818",
    surface: "#242424",
    foreground: "#dddddd",
    accent: "#89b4fa",
  },
  css: "",
};

// Validate both bridge messages and cached data before interpolating CSS values.
// Custom CSS is intentional; palette values are restricted to hex colors.
export function isTheme(value: unknown): value is Theme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Partial<Theme>;
  return (
    (theme.mode === "dark" || theme.mode === "light") &&
    typeof theme.css === "string" &&
    theme.css.length <= 262144 &&
    !!theme.colors &&
    ["background", "surface", "foreground", "accent"].every((key) =>
      /^#[\da-f]{6}$/i.test(theme.colors?.[key as keyof Theme["colors"]] ?? ""),
    )
  );
}
