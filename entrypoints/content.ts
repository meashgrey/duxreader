import {
  READ_STYLESHEET,
  type StylesheetResult,
} from "../lib/stylesheet-source";
import { browser } from "wxt/browser";
import {
  defaultTheme,
  ENABLED_KEY,
  isTheme,
  THEME_KEY,
  type Theme,
} from "../lib/theme";
import {
  EXCLUDED_SITES_KEY,
  isSiteExcluded,
  siteForFrame,
} from "../lib/site-exclusions";
import { isNativeFrame } from "../lib/native-frames";
import { createPageRenderer } from "../lib/page-renderer";
import {
  addUserRule,
  readUserRules,
  toEngineRules,
  USER_RULES_KEY,
  type UserRuleProperty,
  type UserRuleTarget,
} from "../lib/inspector/rules";
import { captureColorDeclarations } from "../lib/inspector/selector";
import { startPicker, type PickerMode } from "../lib/inspector/picker";

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
    let currentTheme: Theme | undefined;
    let cancelPicker: (() => void) | null = null;
    async function apply() {
      const current = ++revision;
      const state = await browser.storage.local.get([
        THEME_KEY,
        ENABLED_KEY,
        EXCLUDED_SITES_KEY,
        USER_RULES_KEY,
      ]);
      if (ctx.isInvalid || current !== revision) return;
      const theme = isTheme(state[THEME_KEY]) ? state[THEME_KEY] : undefined;
      const enabled =
        state[ENABLED_KEY] !== false &&
        !isSiteExcluded(state[EXCLUDED_SITES_KEY], siteForFrame());
      const userRules = readUserRules(state[USER_RULES_KEY]);
      currentTheme = theme;
      renderer.apply(
        theme,
        enabled,
        toEngineRules(userRules, siteForFrame() ?? ""),
      );
    }
    const update = () => {
      void apply().catch((error) =>
        console.error("Duxreader page renderer:", error),
      );
    };
    const host = () => siteForFrame() ?? "";
    async function preserveElement(element: Element, selector: string) {
      const target = host();
      if (!target) throw new Error("This page has no site hostname.");
      renderer.dispose();
      try {
        const declarations = captureColorDeclarations(element);
        const state = await browser.storage.local.get(USER_RULES_KEY);
        const next = addUserRule(readUserRules(state[USER_RULES_KEY]), {
          kind: "preserve",
          host: target,
          selector,
          declarations,
          createdAt: Date.now(),
        });
        await browser.storage.local.set({ [USER_RULES_KEY]: next });
      } finally {
        update();
      }
    }
    async function mapElement(
      selector: string,
      property: UserRuleProperty,
      target: UserRuleTarget,
    ) {
      const hostname = host();
      if (!hostname) throw new Error("This page has no site hostname.");
      const state = await browser.storage.local.get(USER_RULES_KEY);
      const next = addUserRule(readUserRules(state[USER_RULES_KEY]), {
        kind: "map",
        host: hostname,
        selector,
        property,
        target,
        createdAt: Date.now(),
      });
      await browser.storage.local.set({ [USER_RULES_KEY]: next });
    }
    const onMessage: Parameters<
      typeof browser.runtime.onMessage.addListener
    >[0] = (message) => {
      if (message?.type !== "duxreader:start-picker") return;
      const mode: PickerMode = message.mode === "map" ? "map" : "preserve";
      cancelPicker?.();
      cancelPicker = startPicker(document, {
        mode,
        colors: currentTheme?.colors ?? defaultTheme.colors,
        onPreserve: preserveElement,
        onMap: mapElement,
      });
      return Promise.resolve({ ok: true });
    };
    browser.runtime.onMessage.addListener(onMessage);
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (
        area === "local" &&
        (THEME_KEY in changes ||
          ENABLED_KEY in changes ||
          EXCLUDED_SITES_KEY in changes ||
          USER_RULES_KEY in changes)
      )
        update();
    };
    browser.storage.onChanged.addListener(onChanged);
    ctx.onInvalidated(() => {
      revision++;
      cancelPicker?.();
      browser.storage.onChanged.removeListener(onChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      renderer.dispose();
    });
    update();
  },
});
