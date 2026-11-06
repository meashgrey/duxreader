import {
  createStylesheetReader,
  READ_STYLESHEET,
} from "../lib/stylesheet-source";
import { browser } from "wxt/browser";
import {
  HOST_NAME,
  isTheme,
  SOURCE_KEY,
  SOURCE_MODE_KEY,
  THEME_KEY,
  type SourceMode,
} from "../lib/theme";
import {
  fromFirefoxTheme,
  type FirefoxTheme,
  type FirefoxThemeAPI,
} from "../lib/firefox-theme";

export default defineBackground(() => {
  const readStylesheet = createStylesheetReader();
  let port: ReturnType<typeof browser.runtime.connectNative> | undefined;
  let source = "";
  const themeAPI = (browser as unknown as { theme?: FirefoxThemeAPI }).theme;
  let mode: SourceMode = "file";
  let themeRevision = 0;

  async function applyBrowserTheme(value: FirefoxTheme) {
    if (mode !== "browser") return;
    const revision = themeRevision;
    const theme = fromFirefoxTheme(value);
    if (theme) {
      await browser.storage.local.set({
        [THEME_KEY]: theme,
        bridgeStatus: "following-browser",
        bridgeError: "",
        activePath: "",
        lastApplied: Date.now(),
      });
    } else {
      await browser.storage.local.remove([THEME_KEY, "lastApplied"]);
      if (mode !== "browser" || revision !== themeRevision) return;
      await browser.storage.local.set({
        bridgeStatus: "waiting-browser",
        bridgeError: "",
        activePath: "",
      });
    }
  }

  async function refreshBrowserTheme() {
    if (!themeAPI || mode !== "browser") return;
    const revision = ++themeRevision;
    try {
      const current = await themeAPI.getCurrent();
      if (mode === "browser" && revision === themeRevision)
        await applyBrowserTheme(current);
    } catch (error) {
      if (mode === "browser" && revision === themeRevision) {
        await browser.storage.local.set({
          bridgeStatus: "error",
          bridgeError: String(error),
        });
      }
    }
  }

  async function activateMode(next: SourceMode) {
    mode = next;
    themeRevision++;
    if (mode === "browser") {
      const connection = port;
      port = undefined;
      connection?.disconnect();
      await browser.storage.local.set({
        pickerStatus: "idle",
        pickerError: "",
      });
      await refreshBrowserTheme();
    } else {
      if (port) watch();
      else await connect();
    }
  }

  themeAPI?.onUpdated.addListener((info) => {
    if (mode !== "browser") return;
    // Pywalfox sets a global theme. Ignore per-window overrides rather than
    // accidentally applying one window's colors to every page.
    if (info.windowId !== undefined) return;
    themeRevision++;
    void applyBrowserTheme(info.theme);
  });
  let connectionError =
    "Install the local bridge with bun run install:bridge, then reconnect.";

  function watch() {
    if (!port || mode !== "file") return;
    void browser.storage.local.set({
      bridgeStatus: "connecting",
      bridgeError: "",
      activePath: "",
    });
    port.postMessage({ type: "watch", path: source || null });
  }

  async function connect() {
    if (port || mode !== "file") return;
    const state = await browser.storage.local.get(SOURCE_KEY);
    if (port || mode !== "file") return;
    source = typeof state[SOURCE_KEY] === "string" ? state[SOURCE_KEY] : "";
    try {
      const connection = browser.runtime.connectNative(HOST_NAME);
      port = connection;
      // A new host cannot own a dialog left pending by an earlier worker.
      void browser.storage.local.set({ pickerStatus: "idle", pickerError: "" });
      connection.onMessage.addListener((message: unknown) => {
        if (mode !== "file") return;
        if (!message || typeof message !== "object") return;
        const data = message as Record<string, unknown>;
        // The background owns the dialog result because opening a native chooser
        // can dismiss the browser popup before the user selects a file.
        if (data.type === "picked") {
          if (typeof data.error === "string") {
            void browser.storage.local.set({
              pickerStatus: "error",
              pickerError: data.error,
            });
          } else if (typeof data.path === "string") {
            void browser.storage.local
              .set({
                [SOURCE_KEY]: data.path,
                pickerStatus: "selected",
                pickerError: "",
              })
              .then(() => {
                // A repeated selection still requests a fresh snapshot.
                source = data.path as string;
                watch();
              });
          } else {
            void browser.storage.local.set({
              pickerStatus: "cancelled",
              pickerError: "",
            });
          }
          return;
        }
        // Ignore in-flight updates from the source selected before this one.
        if (data.source !== source || typeof data.path !== "string") return;
        if (data.type === "idle") {
          void browser.storage.local.set({
            bridgeStatus: "idle",
            bridgeError: "",
            activePath: "",
          });
        } else if (data.type === "theme" && isTheme(data.theme)) {
          // Only successful snapshots replace the cache shared by pages and popup.
          void browser.storage.local.set({
            [THEME_KEY]: data.theme,
            bridgeStatus: "watching",
            bridgeError: "",
            activePath: data.path,
            lastApplied: Date.now(),
          });
        } else if (data.type === "error" && typeof data.message === "string") {
          void browser.storage.local.set({
            bridgeStatus: "error",
            bridgeError: data.message,
            activePath: data.path,
          });
        }
      });
      connection.onDisconnect.addListener(() => {
        const error =
          browser.runtime.lastError?.message ??
          (connection as typeof connection & { error?: { message?: string } })
            .error?.message;
        connectionError =
          error ??
          "The local bridge disconnected. Check its registration with bun run install:bridge.";
        if (port !== connection) return;
        port = undefined;
        if (mode !== "file") return;
        void browser.storage.local.set({
          pickerStatus: "idle",
          bridgeStatus: "disconnected",
          bridgeError: connectionError,
        });
      });
      watch();
    } catch (error) {
      port = undefined;
      connectionError = String(error);
      void browser.storage.local.set({
        bridgeStatus: "disconnected",
        bridgeError: String(error),
      });
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SOURCE_MODE_KEY]) {
      const next: SourceMode =
        changes[SOURCE_MODE_KEY].newValue === "browser" && themeAPI
          ? "browser"
          : "file";
      if (next !== mode) void activateMode(next);
    }
    if (!changes[SOURCE_KEY] || mode !== "file") return;
    const value = changes[SOURCE_KEY].newValue;
    source = typeof value === "string" ? value : "";
    if (port) watch();
    else void connect();
  });
  // Restrict control messages to extension pages, never website content scripts.
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id) return;
    if (message?.type === READ_STYLESHEET) {
      if (!sender.tab || !sender.url || !/^https?:\/\//.test(sender.url))
        return;
      return readStylesheet(message.url);
    }
    if (sender.tab) return;
    if (message?.type === "pickFile") {
      if (mode !== "file")
        return Promise.resolve({
          ok: false,
          error: "Select the theme-file source first.",
        });
      return (async () => {
        const state = await browser.storage.local.get("pickerStatus");
        if (state.pickerStatus === "opening") return { ok: true };
        await connect();
        if (!port)
          return {
            ok: false,
            error: connectionError,
          };
        const connection = port;
        await browser.storage.local.set({
          pickerStatus: "opening",
          pickerError: "",
        });
        try {
          if (port !== connection) throw new Error(connectionError);
          connection.postMessage({ type: "pickFile" });
        } catch (error) {
          await browser.storage.local.set({
            pickerStatus: "error",
            pickerError: String(error),
          });
          return { ok: false, error: String(error) };
        }
        return { ok: true };
      })();
    }
    if (message?.type !== "reconnect") return;
    if (mode === "browser")
      return refreshBrowserTheme().then(() => ({ ok: true }));
    if (port) watch();
    else void connect();
    return Promise.resolve({ ok: true });
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "bridge-reconnect" && mode === "file") void connect();
  });
  void browser.alarms.create("bridge-reconnect", { periodInMinutes: 1 });
  void (async () => {
    const state = await browser.storage.local.get([
      SOURCE_MODE_KEY,
      SOURCE_KEY,
    ]);
    // Preserve an existing file setup; new Firefox installs follow Pywalfox.
    const next: SourceMode =
      themeAPI &&
      state[SOURCE_MODE_KEY] !== "file" &&
      (state[SOURCE_MODE_KEY] === "browser" || !state[SOURCE_KEY])
        ? "browser"
        : "file";
    mode = next;
    await browser.storage.local.set({
      [SOURCE_MODE_KEY]: next,
      browserThemeAvailable: !!themeAPI,
    });
    await activateMode(next);
  })();
});
