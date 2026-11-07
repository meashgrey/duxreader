import { compileColorMaps } from "./color-map.mts";
import { siteColorMaps } from "./sites/index.mts";
import type { Theme } from "../../lib/theme";
import type { StylesheetReader } from "./network.mts";
import { getPreservedInlineSelectors } from "./semantic-colors.mts";
import { parseColor } from "../../lib/color-roles";
import { DEFAULT_THEME } from "upstream:defaults.ts";
import {
  createOrUpdateDynamicThemeInternal,
  removeDynamicTheme,
} from "upstream:inject/dynamic-theme/index.ts";
import { setStylesheetReader } from "./network.mts";
export function configure(theme: Theme, readCSS?: StylesheetReader) {
  setStylesheetReader(readCSS);
  const colors = theme.colors;
  const url = new URL(location.href);
  const mappedCSS = compileColorMaps(siteColorMaps(url), colors);
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
      ignoreInlineStyle: getPreservedInlineSelectors(url),
      ignoreImageAnalysis: [
        "[data-duxreader-preserve]",
        "[data-duxreader-preserve] *",
      ],
      css: [mappedCSS, theme.css].filter(Boolean).join("\n"),
    },
    window !== window.top,
  );
}
export function remove() {
  removeDynamicTheme();
  setStylesheetReader();
}
