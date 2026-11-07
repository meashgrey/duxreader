import * as original from "upstream:inject/dynamic-theme/modify-colors.ts";
import {
  getRegisteredColor,
  registerColor,
} from "upstream:inject/dynamic-theme/palette.ts";
import { rgbToString } from "upstream:utils/color.ts";
import { mapDesktopColor } from "../../lib/engine/desktop-colors";

export const themeCacheKeys = original.themeCacheKeys;
// Include surface/accent in upstream rule/color cache keys. The lifecycle
// adapter resets inline caches when the desktop palette changes.
themeCacheKeys.push("duxPalette");
export const clearColorModificationCache = original.clearColorModificationCache;
export const modifyColor = original.modifyColor;
function modify(role, rgb, theme, register = true) {
  if (register) {
    const found = getRegisteredColor(role, rgb);
    if (found) return found;
  }
  const mapped = mapDesktopColor(rgb, role, theme.duxColors);
  const value = mapped
    ? rgbToString(mapped)
    : {
        background: original.modifyBackgroundColor,
        text: original.modifyForegroundColor,
        border: original.modifyBorderColor,
      }[role](rgb, theme, false);
  return register ? registerColor(role, rgb, value) : value;
}
export function modifyBackgroundColor(rgb, theme, register = true) {
  return modify("background", rgb, theme, register);
}
export function modifyForegroundColor(rgb, theme, register = true) {
  return modify("text", rgb, theme, register);
}
export function modifyBorderColor(rgb, theme, register = true) {
  return modify("border", rgb, theme, register);
}
export const modifyShadowColor = modifyBackgroundColor;
export const modifyGradientColor = modifyBackgroundColor;
