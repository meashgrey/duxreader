import { browser } from "wxt/browser";
import { defaultTheme, ENABLED_KEY, isTheme, THEME_KEY } from "../lib/theme";

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
      if (state[ENABLED_KEY] === false) {
        style.textContent = "";
        return;
      }
      const theme = isTheme(state[THEME_KEY]) ? state[THEME_KEY] : defaultTheme;
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
    browser.storage.onChanged.addListener(apply);
    ctx.onInvalidated(() => {
      // WXT invalidates this context during development reloads.
      style.remove();
      browser.storage.onChanged.removeListener(apply);
    });
    await apply();
  },
});
