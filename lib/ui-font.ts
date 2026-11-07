export const UI_FONT_KEY = "uiFont";
export const SYSTEM_UI_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const UI_FONTS = [
  "Cascadia Code",
  "Cascadia Mono",
  "Segoe UI",
  "Roboto",
  "Noto Sans",
  "Inter",
  "Ubuntu",
  "Cantarell",
  "DejaVu Sans",
  "Liberation Sans",
  "Arial",
  "Helvetica Neue",
  "SF Pro Text",
  "JetBrains Mono",
  "Fira Code",
] as const;

export function normalizeUIFont(value: unknown): string {
  return typeof value === "string" &&
    UI_FONTS.includes(value as (typeof UI_FONTS)[number])
    ? value
    : "system";
}

export function applyUIFont(value: unknown) {
  const font = normalizeUIFont(value);
  document.documentElement.style.setProperty(
    "--duxreader-ui-font",
    font === "system" ? SYSTEM_UI_FONT : `"${font}", ${SYSTEM_UI_FONT}`,
  );
}

// Font access APIs are not shared by Firefox and Chromium. Compare known
// families against fallback metrics without requesting local-font permissions.
export function installedUIFonts(): string[] {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  const sample = "mmmmmmmmwwwwiiii11110000W@#";
  return UI_FONTS.filter((font) =>
    ["monospace", "serif", "sans-serif"].some((fallback) => {
      context.font = `72px ${fallback}`;
      const baseline = context.measureText(sample).width;
      context.font = `72px "${font}", ${fallback}`;
      return Math.abs(context.measureText(sample).width - baseline) > 0.01;
    }),
  );
}
