/// <reference path="../../vendor/darkreader/index.d.ts" />

// Bun resolves these virtual modules to pinned source files at build time.
// TypeScript uses the upstream public API and these narrow internal signatures
// instead of type-checking the upstream extension's entire application.
declare module "upstream:defaults.ts" {
  export const DEFAULT_THEME: import("./types.mts").EngineTheme;
}
declare module "upstream:inject/dynamic-theme/index.ts" {
  export function createOrUpdateDynamicThemeInternal(
    theme: import("./types.mts").EngineTheme,
    fixes: Partial<DarkReader.DynamicThemeFix> | null,
    iframe: boolean,
  ): void;
  export function removeDynamicTheme(): void;
}
declare module "upstream:inject/dynamic-theme/modify-colors.ts" {
  type RGB = import("./types.mts").EngineColor;
  type Theme = import("./types.mts").EngineTheme;
  export const themeCacheKeys: (keyof Theme)[];
  export function clearColorModificationCache(): void;
  export function modifyColor(rgb: RGB, theme: Theme): string;
  export function modifyBackgroundColor(
    rgb: RGB,
    theme: Theme,
    register?: boolean,
  ): string;
  export const modifyForegroundColor: typeof modifyBackgroundColor;
  export const modifyBorderColor: typeof modifyBackgroundColor;
}
declare module "upstream:inject/dynamic-theme/palette.ts" {
  type RGB = import("./types.mts").EngineColor;
  type Role = import("./types.mts").ColorRole;
  export function getRegisteredColor(role: Role, rgb: RGB): string | null;
  export function registerColor(role: Role, rgb: RGB, value: string): string;
}
declare module "upstream:utils/color.ts" {
  export function rgbToString(rgb: import("./types.mts").EngineColor): string;
}
declare module "upstream:inject/dynamic-theme/stylesheet-proxy.ts" {
  export function injectProxy(
    stylesheets: boolean,
    customElements: boolean,
  ): void;
}
