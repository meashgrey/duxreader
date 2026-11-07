import React from "react";
import { browser } from "wxt/browser";
import { applyUIFont, normalizeUIFont, UI_FONT_KEY } from "./ui-font";

export function useUIFont() {
  const [font, setFont] = React.useState("system");
  React.useEffect(() => {
    let disposed = false;
    let changed = false;
    const apply = (value: unknown) => {
      if (disposed) return;
      applyUIFont(value);
      setFont(normalizeUIFont(value));
    };
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && UI_FONT_KEY in changes) {
        changed = true;
        apply(changes[UI_FONT_KEY]?.newValue);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local.get(UI_FONT_KEY).then((data) => {
      if (!changed) apply(data[UI_FONT_KEY]);
    });
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  const selectFont = (value: string) =>
    browser.storage.local.set({ [UI_FONT_KEY]: normalizeUIFont(value) });
  return [font, selectFont] as const;
}
