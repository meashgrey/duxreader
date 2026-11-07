import type { Theme } from "./theme";
import { configure, remove } from "./engine/kernel.js";

// The dynamic renderer owns per-document upstream state. Keep desktop bridge,
// storage, and popup concerns outside its observers and rule compilation.
export function createPageRenderer(
  doc: Document = document,
  options: { readCSS?: (url: string) => Promise<string> } = {},
) {
  if (doc !== document)
    throw new Error(
      "Create the renderer in its document's content-script context",
    );
  let previous = "";
  let active = false;
  function stop() {
    if (active) remove();
    active = false;
    previous = "";
  }
  return {
    apply(theme: Theme | undefined, enabled: boolean) {
      if (!theme || !enabled) return stop();
      const key = JSON.stringify(theme);
      if (active && key === previous) return;
      // Desktop palettes can change roles that upstream's inline cache key
      // does not include. A rare palette update uses upstream teardown before
      // reinitializing; ordinary page interactions retain all core caches.
      if (active) remove();
      configure(theme, options.readCSS);
      previous = key;
      active = true;
    },
    dispose: stop,
  };
}
