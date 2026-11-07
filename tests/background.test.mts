import { expect, mock, test } from "bun:test";

// The browser mock stores heterogeneous extension storage and message payloads.
const state: {
  sourceMode: string;
  bridgeError?: string;
  bridgeStatus?: string;
  pickerStatus?: string;
  sourcePath?: string;
  theme?: import("../lib/theme").Theme;
} = { sourceMode: "file" };
const stored = state as Record<string, unknown>;
let themeUpdated: (event: { theme: object }) => void;
const browserPalette = {
  colors: {
    ntp_background: "#111318",
    ntp_text: "#e1e2e9",
    popup: "#1d2024",
    icons: "#a8c8ff",
  },
  properties: { color_scheme: "dark" },
};
let receive: (message: object) => void;
let control: (message: object, sender: object) => unknown;
let disconnected: () => void;
const commands: object[] = [];
type ChangeListener = (
  changes: Record<string, { newValue: unknown }>,
  area: string,
) => void;
const changeListeners: ChangeListener[] = [];
const port = {
  disconnect: () => disconnected(),
  postMessage: (command: object) => commands.push(command),
  onMessage: {
    addListener: (listener: typeof receive) => {
      receive = listener;
    },
  },
  onDisconnect: {
    addListener: (listener: typeof disconnected) => {
      disconnected = listener;
    },
  },
};
mock.module("wxt/browser", () => ({
  browser: {
    theme: {
      getCurrent: async () => browserPalette,
      onUpdated: {
        addListener: (listener: typeof themeUpdated) => {
          themeUpdated = listener;
        },
      },
    },
    runtime: {
      id: "duxreader-test",
      connectNative: () => port,
      onMessage: {
        addListener: (listener: typeof control) => {
          control = listener;
        },
      },
    },
    storage: {
      local: {
        get: async () => ({ ...state }),
        remove: async (keys: string[]) => {
          const changes: Record<string, { newValue: unknown }> = {};
          for (const key of keys) {
            delete stored[key];
            changes[key] = { newValue: undefined };
          }
          for (const listener of changeListeners) listener(changes, "local");
        },
        set: async (values: Record<string, unknown>) => {
          const changes: Record<string, { newValue: unknown }> = {};
          for (const [key, value] of Object.entries(values)) {
            if (stored[key] !== value) changes[key] = { newValue: value };
          }
          Object.assign(state, values);
          for (const listener of changeListeners) listener(changes, "local");
        },
      },
      onChanged: {
        addListener: (listener: ChangeListener) =>
          changeListeners.push(listener),
      },
    },
    alarms: { create: async () => {}, onAlarm: { addListener: () => {} } },
  },
}));
(
  globalThis as typeof globalThis & {
    defineBackground: (callback: () => void) => void;
  }
).defineBackground = (callback) => callback();
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("the background retains a native selection without an open popup and preserves it on cancellation", async () => {
  await import("../entrypoints/background.ts");
  await settle();
  const sender = { id: "duxreader-test" };
  state.bridgeError = "Stale first-run file error";
  receive({ type: "idle", source: "", path: "/tmp/default-theme.json" });
  await settle();
  expect(state.bridgeStatus).toBe("idle");
  expect(state.bridgeError).toBe("");
  expect(await control({ type: "pickFile" }, sender)).toEqual({ ok: true });
  expect(commands.at(-1)).toEqual({ type: "pickFile" });
  expect(state.pickerStatus).toBe("opening");
  // There is no popup listener: persistence must be handled by the background.
  receive({ type: "picked", path: "/tmp/matugen-theme.json", error: null });
  await settle();
  expect(state.sourcePath).toBe("/tmp/matugen-theme.json");
  expect(commands.at(-1)).toEqual({
    type: "watch",
    path: "/tmp/matugen-theme.json",
  });
  receive({ type: "picked", path: null, error: null });
  await settle();
  expect(state.pickerStatus).toBe("cancelled");
  expect(state.sourcePath).toBe("/tmp/matugen-theme.json");
  expect(
    control({ type: "pickFile" }, { ...sender, tab: { id: 1 } }),
  ).toBeUndefined();
  disconnected();
  await settle();
  expect(state.pickerStatus).toBe("idle");
  expect(state.bridgeStatus).toBe("disconnected");
});

test("Pywalfox browser themes update pages without a native host and file mode stays independent", async () => {
  const { browser } = await import("wxt/browser");
  await browser.storage.local.set({ sourceMode: "browser" });
  await settle();
  expect(state.bridgeStatus).toBe("following-browser");
  expect(state.theme!.colors).toEqual({
    background: "#111318",
    surface: "#1d2024",
    foreground: "#e1e2e9",
    accent: "#a8c8ff",
  });
  const count = commands.length;
  themeUpdated({
    theme: {
      ...browserPalette,
      colors: { ...browserPalette.colors, icons: "#ff0000" },
    },
  });
  await settle();
  expect(state.theme!.colors.accent).toBe("#ff0000");
  expect(commands.length).toBe(count);
  themeUpdated({ theme: {} });
  await settle();
  expect(state.bridgeStatus).toBe("waiting-browser");
  expect(state.theme).toBeUndefined();
  await browser.storage.local.set({ sourceMode: "file" });
  await settle();
  themeUpdated({ theme: browserPalette });
  await settle();
  expect(state.bridgeStatus).not.toBe("following-browser");
  expect(state.theme).toBeUndefined();
});

test("stylesheet reads require an owned HTTP content script and never grant page control messages", async () => {
  const { READ_STYLESHEET } = await import("../lib/stylesheet-source.ts");
  const message = { type: READ_STYLESHEET, url: "file:///tmp/theme.css" };
  expect(
    control(message, {
      id: "other-extension",
      tab: { id: 1 },
      url: "https://example.org",
    }),
  ).toBeUndefined();
  expect(control(message, { id: "duxreader-test" })).toBeUndefined();
  expect(
    control(message, {
      id: "duxreader-test",
      tab: { id: 1 },
      url: "about:blank",
    }),
  ).toBeUndefined();
  expect(
    await control(message, {
      id: "duxreader-test",
      tab: { id: 1 },
      url: "https://example.org",
    }),
  ).toMatchObject({ ok: false });
});
