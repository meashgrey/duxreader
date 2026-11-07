// Community-build extension points. Paid features are compiled out.
import type { EngineTheme } from "./types.mts";

export function extendThemeCacheKeys(_keys: (keyof EngineTheme)[]): void {}
export function getBackgroundPoles(..._args: unknown[]): never {
  throw new Error("PLUS is disabled");
}
export const getTextPoles = getBackgroundPoles;
export const modifyBgColorExtended = getBackgroundPoles;
export const modifyFgColorExtended = getBackgroundPoles;
export const modifyLightSchemeColorExtended = getBackgroundPoles;
