import { parseColor } from "../../lib/color-roles";
import { DEFAULT_THEME } from "upstream:defaults.ts";
import {
  createOrUpdateDynamicThemeInternal,
  removeDynamicTheme,
} from "upstream:inject/dynamic-theme/index.ts";
import { setStylesheetReader } from "./network";
export function configure(theme, readCSS) {
  setStylesheetReader(readCSS);
  const colors = theme.colors;
  // Establish the page's native background once, before injection. This is
  // palette input only; interaction processing stays entirely in upstream CSS.
  let sourceBackground = parseColor(
    getComputedStyle(document.body ?? document.documentElement).backgroundColor,
  );
  if (!sourceBackground?.a)
    sourceBackground = parseColor(
      getComputedStyle(document.documentElement).backgroundColor,
    );
  const palette = {
    colors,
    material: theme.material,
    sourceBackground: sourceBackground?.a ? sourceBackground : undefined,
  };
  createOrUpdateDynamicThemeInternal(
    {
      ...DEFAULT_THEME,
      mode: theme.mode === "dark" ? 1 : 0,
      darkSchemeBackgroundColor: colors.background,
      lightSchemeBackgroundColor: colors.background,
      darkSchemeTextColor: colors.foreground,
      lightSchemeTextColor: colors.foreground,
      selectionColor: colors.accent,
      duxColors: palette,
      duxPalette: JSON.stringify(palette),
    },
    {
      ignoreInlineStyle: [
        "[data-duxreader-preserve]",
        "[data-duxreader-preserve] *",
      ],
      ignoreImageAnalysis: [
        "[data-duxreader-preserve]",
        "[data-duxreader-preserve] *",
      ],
      css: theme.css,
    },
    window !== window.top,
  );
}
export function remove() {
  removeDynamicTheme();
  setStylesheetReader();
}
