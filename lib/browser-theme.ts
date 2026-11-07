import type { Theme } from "./theme";

export interface BrowserTheme {
  colors?: Record<string, unknown>;
  properties?: { color_scheme?: string; content_color_scheme?: string };
}

// Browser theme providers can supply normalized rgb()/rgba() strings or arrays,
// while Pywalfox generates hexadecimal strings. Normalize before creating CSS.
export function hexColor(value: unknown): string | undefined {
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value))
    return value.toLowerCase();
  if (typeof value === "string" && /^#[\da-f]{3}$/i.test(value)) {
    return (
      "#" +
      [...value.slice(1)]
        .map((char) => char + char)
        .join("")
        .toLowerCase()
    );
  }
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([\d.]+))?\s*\)$/i
          .exec(value)
          ?.slice(1)
          .filter((item) => item !== undefined)
          .map(Number)
      : undefined;
  if (
    !values ||
    (values.length !== 3 && values.length !== 4) ||
    !values.every(
      (channel) => typeof channel === "number" && Number.isFinite(channel),
    ) ||
    values.slice(0, 3).some((channel) => channel < 0 || channel > 255) ||
    (values.length === 4 && values[3] !== 1)
  )
    return undefined;
  return (
    "#" +
    values
      .slice(0, 3)
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function fromBrowserTheme(input: BrowserTheme): Theme | undefined {
  const colors = input.colors;
  if (!colors) return undefined;
  const pick = (...names: string[]) =>
    names.map((name) => hexColor(colors[name])).find(Boolean);
  // Match the Pywalfox palette's Background and Text roles using its browser
  // template. Per-element overrides remain reflected in the corresponding role.
  const background = pick("ntp_background", "frame", "toolbar");
  const foreground = pick(
    "ntp_text",
    "toolbar_field_text",
    "popup_text",
    "toolbar_text",
    "tab_background_text",
  );
  if (!background || !foreground) return undefined;
  const surface = pick("popup", "toolbar", "tab_selected") ?? background;
  const accent =
    pick(
      "icons",
      "toolbar_field_highlight",
      "popup_highlight",
      "tab_loading",
    ) ?? foreground;
  const mode =
    input.properties?.content_color_scheme ?? input.properties?.color_scheme;
  const channels = background
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16));
  const dark =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722 < 128;
  return {
    mode: mode === "light" || mode === "dark" ? mode : dark ? "dark" : "light",
    colors: { background, surface, foreground, accent },
    css: "",
  };
}

// Optional browser-theme observation capability, currently provided by Firefox.
// Chromium uses the file source when this capability is absent. Duxreader never
// calls theme.update(), so the theme provider retains ownership of browser chrome.
export interface BrowserThemeAPI {
  getCurrent(): Promise<BrowserTheme>;
  onUpdated: {
    addListener(
      listener: (info: { theme: BrowserTheme; windowId?: number }) => void,
    ): void;
  };
}
