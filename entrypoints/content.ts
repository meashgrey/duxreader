import { browser } from "wxt/browser";
import { ENABLED_KEY, isTheme, THEME_KEY } from "../lib/theme";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  async main(ctx) {
    // Reuse one stylesheet so updates replace old rules instead of accumulating.
    const style = document.createElement("style");
    style.dataset.duxreader = "theme";
    document.documentElement.append(style);
    async function apply() {
      const state = await browser.storage.local.get([THEME_KEY, ENABLED_KEY]);
      if (ctx.isInvalid) return;
      if (state[ENABLED_KEY] === false || !isTheme(state[THEME_KEY])) {
        style.textContent = "";
        return;
      }
      const theme = state[THEME_KEY];
      const c = theme.colors;
      // User CSS follows the base rules and can reuse the exported variables.
      // These base rules are a starting point, not automatic site recoloring.
      style.textContent = `
        :root {
          color-scheme: ${theme.mode};
          --dux-bg: ${c.background}; --dux-surface: ${c.surface};
          --dux-fg: ${c.foreground}; --dux-accent: ${c.accent};
        }
        html, body { background-color: var(--dux-bg) !important; color: var(--dux-fg) !important; }
        a { color: var(--dux-accent) !important; }
        ${theme.css}
      `;
    }
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && (THEME_KEY in changes || ENABLED_KEY in changes))
        void apply();
    };
    browser.storage.onChanged.addListener(onChanged);
    ctx.onInvalidated(() => {
      // WXT invalidates this context during development reloads.
      style.remove();
      browser.storage.onChanged.removeListener(onChanged);
    });
    await apply();
  },
});
