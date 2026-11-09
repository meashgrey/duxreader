import {
  READ_STYLESHEET,
  type StylesheetResult,
} from "../lib/stylesheet-source";
import { browser } from "wxt/browser";
import { ENABLED_KEY, isTheme, THEME_KEY } from "../lib/theme";
import {
  EXCLUDED_SITES_KEY,
  isSiteExcluded,
  siteForFrame,
} from "../lib/site-exclusions";
import { isNativeFrame } from "../lib/native-frames";
import { createPageRenderer } from "../lib/page-renderer";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  async main(ctx) {
    if (isNativeFrame(new URL(location.href))) return;
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
      const state = await browser.storage.local.get([
        THEME_KEY,
        ENABLED_KEY,
        EXCLUDED_SITES_KEY,
      ]);
      if (ctx.isInvalid || current !== revision) return;
      renderer.apply(
        isTheme(state[THEME_KEY]) ? state[THEME_KEY] : undefined,
        state[ENABLED_KEY] !== false &&
          !isSiteExcluded(state[EXCLUDED_SITES_KEY], siteForFrame()),
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
      if (
        area === "local" &&
        (THEME_KEY in changes ||
          ENABLED_KEY in changes ||
          EXCLUDED_SITES_KEY in changes)
      )
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
