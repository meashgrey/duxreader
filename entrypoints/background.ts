import { browser } from "wxt/browser";
import { HOST_NAME, isTheme, THEME_KEY } from "../lib/theme";

export default defineBackground(() => {
  let port: ReturnType<typeof browser.runtime.connectNative> | undefined;
  function connect() {
    // Reuse the live port so each retry does not spawn another native host.
    if (port) return;
    try {
      port = browser.runtime.connectNative(HOST_NAME);
      port.onMessage.addListener(async (message: unknown) => {
        if (isTheme(message)) {
          // Storage retains the last valid theme across reconnects and notifies
          // every content script without requiring a page refresh.
          await browser.storage.local.set({
            [THEME_KEY]: message,
            bridgeStatus: "connected",
          });
        }
      });
      port.onDisconnect.addListener(() => {
        // runtime.lastError is only available while this callback is running.
        const error = browser.runtime.lastError?.message;
        port = undefined;
        void browser.storage.local.set({
          bridgeStatus: error ?? "disconnected",
        });
      });
    } catch (error) {
      port = undefined;
      void browser.storage.local.set({ bridgeStatus: String(error) });
    }
  }
  // Browser alarms can wake the MV3 worker after its connection has been lost.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "bridge-reconnect") connect();
  });
  void browser.alarms.create("bridge-reconnect", { periodInMinutes: 1 });
  connect();
});
