// Preserve upstream's form binding and validation, starting it after React has
// mounted every field. Import this module only after DOMContentLoaded, so the
// upstream automatic initialization cannot run against an empty React root.
// @ts-expect-error Vendored Vimium has no declaration files.
import { init } from "../../vendor/vimium/pages/options.js";
// @ts-expect-error Vendored Vimium has no declaration files.
import { Commands } from "../../vendor/vimium/background_scripts/commands.js";

export async function initializeOptions() {
  const globals = globalThis as unknown as {
    Settings: { onLoaded(): Promise<void> };
    DomUtils: { injectUserCss(): void };
  };
  await globals.Settings.onLoaded();
  globals.DomUtils.injectUserCss();
  await Commands.init();
  await init();
}
