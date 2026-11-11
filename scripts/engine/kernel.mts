import { compileColorMaps } from "./color-map.mts";
import { siteColorMaps } from "./sites/index.mts";
import type { Theme } from "../../lib/theme";
import type { StylesheetReader } from "./network.mts";
import { getPreservedInlineSelectors } from "./semantic-colors.mts";
import { parseColor } from "../../lib/color-roles";
import { vimiumContentTheme } from "../../lib/vimium/content-theme";
import type { UserEngineRules } from "../../lib/inspector/rules";
import { DEFAULT_THEME } from "upstream:defaults.ts";
import {
  createOrUpdateDynamicThemeInternal,
  removeDynamicTheme,
} from "upstream:inject/dynamic-theme/index.ts";
import { setStylesheetReader } from "./network.mts";
export function configure(
  theme: Theme,
  readCSS?: StylesheetReader,
  userRules?: UserEngineRules,
) {
  setStylesheetReader(readCSS);
  const colors = theme.colors;
  const url = new URL(location.href);
  const mappedCSS = compileColorMaps(
    [...siteColorMaps(url), ...(userRules?.colorMaps ?? [])],
    colors,
  );
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
        ...getPreservedInlineSelectors(url),
        ...(userRules?.preserveInline ?? []),
      ],
      ignoreImageAnalysis: [
        "[data-duxreader-preserve]",
        "[data-duxreader-preserve] *",
      ],
      css: [
        mappedCSS,
        userRules?.css ?? "",
        vimiumContentTheme(theme),
        theme.css,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    window !== window.top,
  );
}
export function remove() {
  removeDynamicTheme();
  setStylesheetReader();
}
