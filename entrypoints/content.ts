import {
  READ_STYLESHEET,
  type StylesheetResult,
} from "../lib/stylesheet-source";
import { browser } from "wxt/browser";
import { ENABLED_KEY, isTheme, THEME_KEY } from "../lib/theme";
import { createPageRenderer } from "../lib/page-renderer";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  async main(ctx) {
    const renderer = createPageRenderer(document, {
      async readCSS(url) {
        const result: StylesheetResult = await browser.runtime.sendMessage({
          type: READ_STYLESHEET,
          url,
        });
        if (!result?.ok)
          throw new Error(result?.error ?? "Stylesheet unavailable");
        return result.css;
      },
    });
    let revision = 0;
    async function apply() {
      const current = ++revision;
      const state = await browser.storage.local.get([THEME_KEY, ENABLED_KEY]);
      if (ctx.isInvalid || current !== revision) return;
      renderer.apply(
        isTheme(state[THEME_KEY]) ? state[THEME_KEY] : undefined,
        state[ENABLED_KEY] !== false,
      );
    }
    const update = () => {
      void apply().catch((error) =>
        console.error("Duxreader page renderer:", error),
      );
    };
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && (THEME_KEY in changes || ENABLED_KEY in changes))
        update();
    };
    browser.storage.onChanged.addListener(onChanged);
    ctx.onInvalidated(() => {
      revision++;
      browser.storage.onChanged.removeListener(onChanged);
      renderer.dispose();
    });
    update();
  },
});
