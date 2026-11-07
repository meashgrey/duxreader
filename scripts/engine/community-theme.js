// Community-build extension points. Paid features are compiled out.
export function extendThemeCacheKeys() {}
export function getBackgroundPoles() {
  throw new Error("PLUS is disabled");
}
export const getTextPoles = getBackgroundPoles;
export const modifyBgColorExtended = getBackgroundPoles;
export const modifyFgColorExtended = getBackgroundPoles;
export const modifyLightSchemeColorExtended = getBackgroundPoles;
