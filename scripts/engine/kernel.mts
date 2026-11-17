import { compileColorMaps } from "./color-map.mts";
import { siteColorMaps, siteCSS } from "./sites/index.mts";
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
// Sample the page's own background color. Many sites (SPAs, CSS-in-JS) paint
// their real background after document_idle, so this must be re-read rather
// than captured once: a stale sample stops matching the page and pushes the
// main background onto the surface role once the stylesheet finally lands.
let observedSourceBackground: string | undefined;
let backgroundObserver: MutationObserver | null = null;
let reconfigureTimer: number | null = null;
// The last applied configuration, so a late-arriving page background can be
// re-applied without the caller having to notice.
let lastConfigure: (() => void) | null = null;
// Guards the re-apply path: configure() schedules another check, so without this
// a repaint would recurse through remove/apply forever.
let reapplying = false;

function readSourceBackground(): string | undefined {
  const body = getComputedStyle(
    document.body ?? document.documentElement,
  ).backgroundColor;
  const parsed = parseColor(body) ?? parseColor(
    getComputedStyle(document.documentElement).backgroundColor,
  );
  if (!parsed?.a) return undefined;
  return `${parsed.r},${parsed.g},${parsed.b},${parsed.a}`;
}

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
  // Palette input only; interaction processing stays entirely in upstream CSS.
  // Remember how to re-apply this exact configuration.
  lastConfigure = () => configure(theme, readCSS, userRules);
  observedSourceBackground = readSourceBackground();
  const sourceBackground = observedSourceBackground
    ? parseColor(`rgb(${observedSourceBackground})`)
    : undefined;
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
        siteCSS(url),
        userRules?.css ?? "",
        vimiumContentTheme(theme),
        theme.css,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    window !== window.top,
  );

  // Re-sample the page background until it settles. A single early sample is
  // what made the main background flip to surface a moment after load.
  // Only the outer configure() owns the observer; the re-apply path must not
  // re-enter it.
  if (backgroundObserver === null) {
    backgroundObserver = new MutationObserver(scheduleReconfigure);
  }
  // Sites change their background by adding stylesheets, toggling classes, or
  // setting attributes; watch the whole document head and the root element so a
  // late stylesheet is noticed without observing every node in the page.
  backgroundObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  if (document.head)
    backgroundObserver.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  if (!reapplying) scheduleReconfigure();
}

// Rebuilds the theme when the page's own background changes.
//
// getComputedStyle returns the *themed* colour once injection is active, so a
// direct read cannot detect the page's own change. Peel the theme off, read the
// native value, and immediately re-apply — all inside one synchronous task, so
// the browser never paints the intermediate state and there is no flash.
function scheduleReconfigure() {
  // Correct inside the same animation frame as the mutation. A setTimeout(0)
  // still lets the browser paint one frame with the stale palette, which shows
  // up as a brief surface flash; a rAF callback runs before that paint.
  if (reconfigureTimer !== null) return;
  reconfigureTimer = requestAnimationFrame(() => {
    reconfigureTimer = null;
    const reapply = lastConfigure;
    if (!reapply) return;
    // Peel the theme off to read the page's own colour, then restore it in the
    // same task so the browser never paints the unthemed intermediate.
    removeDynamicTheme();
    const native = readSourceBackground();
    if (native && native !== observedSourceBackground)
      observedSourceBackground = native;
    // configure() schedules another check; `reapplying` keeps that from
    // recursing through remove/apply while this one is still on the stack.
    reapplying = true;
    try {
      reapply();
    } finally {
      reapplying = false;
    }
  });
}

export function remove() {
  if (backgroundObserver !== null) {
    backgroundObserver.disconnect();
    backgroundObserver = null;
  }
  observedSourceBackground = undefined;
  lastConfigure = null;
  if (reconfigureTimer !== null) {
    cancelAnimationFrame(reconfigureTimer);
    reconfigureTimer = null;
  }
  removeDynamicTheme();
  setStylesheetReader();
}
