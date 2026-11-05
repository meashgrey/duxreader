import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    // Keep the dev server running without launching a browser or its debugger.
    // Used by dev:firefox:manual when automatic startup cannot connect.
    disabled: process.env.DUXREADER_NO_BROWSER === "1",
  },
  manifest: {
    name: "Duxreader",
    description: "Bring your desktop palette to the web.",
    permissions: ["storage", "nativeMessaging", "alarms"],
    browser_specific_settings: {
      gecko: {
        // Must match allowed_extensions in the Firefox native host manifest.
        id: "duxreader@duxreader.local",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
});
