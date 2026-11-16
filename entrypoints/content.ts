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
import {
  describeColorFamily,
  selectorFor,
} from "../lib/inspector/selector";
import {
  startPicker,
  type PickerMode,
  type PreserveRequest,
  type PreserveResult,
} from "../lib/inspector/picker";

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
    // Every frame runs its own picker. The frame that started one keeps the
    // crosshair and refuses page clicks everywhere, but only one frame should
    // report an exit, otherwise the frames would cancel each other forever.
    let pickerActive = false;
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
    let pendingPreserve: {
      element: Element;
      stable: string;
      own: string;
      varying: readonly string[];
      identityVariants: number;
    } | null = null;
    function sampleElements(matches: readonly Element[]): readonly Element[] {
      const limit = 200;
      if (matches.length <= limit) return matches;
      const step = Math.ceil(matches.length / limit);
      return matches.filter((_, index) => index % step === 0);
    }
    // Distinct-color families need one native snapshot per element.
    function measureEach(matches: readonly Element[]) {
      renderer.dispose();
      try {
        return matches.flatMap((match) => {
          const declarations = describeColorFamily(match, [match]).own;
          return declarations
            ? [{ selector: selectorFor(match), declarations }]
            : [];
        });
      } finally {
        update();
      }
    }
    // Measure native colors with the renderer removed, then always restore it.
    function measurePreserve(request: PreserveRequest) {
      renderer.dispose();
      try {
        return describeColorFamily(
          request.element,
          sampleElements(request.matches),
        );
      } finally {
        update();
      }
    }
    async function preserveElement(
      request: PreserveRequest,
    ): Promise<PreserveResult> {
      const target = host();
      if (!target) throw new Error("This page has no site hostname.");
      const cached =
        pendingPreserve?.element === request.element ? pendingPreserve : null;
      if (!request.commit) {
        if (cached)
          return {
            identityVariants: cached.identityVariants,
            stable: cached.stable,
            own: cached.own,
            varying: cached.varying,
            saved: false,
          };
        const family = measurePreserve(request);
        pendingPreserve = { element: request.element, ...family };
        return {
          identityVariants: family.identityVariants,
          stable: family.stable,
          own: family.own,
          varying: family.varying,
          saved: false,
        };
      }
      const family = cached ?? measurePreserve(request);
      pendingPreserve = null;
      const state = await browser.storage.local.get(USER_RULES_KEY);
      let next = readUserRules(state[USER_RULES_KEY]);
      if (request.variant === "each") {
        // Distinct colors cannot share one snapshot, so every instance gets
        // its own rule keyed by the exact selector that reaches only it.
        const captured = measureEach(request.matches);
        if (captured.length === 0)
          throw new Error("These elements have no colors to preserve.");
        for (const [index, entry] of captured.entries()) {
          next = addUserRule(next, {
            kind: "preserve",
            host: target,
            selector: entry.selector,
            declarations: entry.declarations,
            createdAt: Date.now() + index,
          });
        }
      } else {
        const declarations =
          request.variant === "own" ? family.own : family.stable;
        if (!declarations)
          throw new Error("This element has no colors to preserve.");
        next = addUserRule(next, {
          kind: "preserve",
          host: target,
          selector: request.selector,
          declarations,
          createdAt: Date.now(),
        });
      }
      await browser.storage.local.set({ [USER_RULES_KEY]: next });
      return {
        identityVariants: family.identityVariants,
        stable: family.stable,
        own: family.own,
        varying: family.varying,
        saved: true,
      };
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
      if (message?.type === "duxreader:stop-picker") {
        if (!pickerActive) return;
        pickerActive = false;
        const cancel = cancelPicker;
        cancelPicker = null;
        cancel?.();
        return Promise.resolve({ ok: true });
      }
      if (message?.type !== "duxreader:start-picker") return;
      const mode: PickerMode = message.mode === "map" ? "map" : "preserve";
      cancelPicker?.();
      pendingPreserve = null;
      pickerActive = true;
      cancelPicker = startPicker(document, {
        mode,
        colors: currentTheme?.colors ?? defaultTheme.colors,
        showHint: window === window.top,
        onPreserve: preserveElement,
        onMap: mapElement,
        onExit: () => {
          if (!pickerActive) return;
          pickerActive = false;
          cancelPicker = null;
          // Tell the sibling frames to drop their own pickers.
          void browser.runtime
            .sendMessage({ type: "duxreader:stop-picker" })
            .catch(() => undefined);
        },
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
