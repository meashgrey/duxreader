import React from "react";
import { useUIFont } from "../use-ui-font";
import { browser } from "wxt/browser";
import { materialRoles } from "../material";
import { defaultTheme, isTheme, THEME_KEY, type Theme } from "../theme";

// Extension pages cannot rely on Duxreader's content-script engine. Map the
// same Material roles from the shared palette onto every Vimium overlay.
export function useVimiumTheme(): Theme {
  useUIFont();
  const [theme, setTheme] = React.useState(defaultTheme);
  React.useEffect(() => {
    let disposed = false;
    const apply = (value: unknown) => {
      if (disposed) return;
      const next = isTheme(value) ? value : defaultTheme;
      setTheme(next);
      const root = document.documentElement;
      root.style.colorScheme = next.mode;
      root.dataset.duxreaderTheme = next.mode;
      for (const [key, color] of Object.entries(materialRoles(next)))
        root.style.setProperty(`--md-sys-color-${key}`, color);
    };
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && THEME_KEY in changes)
        apply(changes[THEME_KEY]?.newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local.get(THEME_KEY).then((data) => {
      if (!disposed) apply(data[THEME_KEY]);
    });
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  return theme;
}
