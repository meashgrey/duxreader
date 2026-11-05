import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    // Bundle deep component imports ahead of popup navigation during development.
    // Otherwise their internal ESM graph is fetched through the dev server.
    optimizeDeps: {
      include: [
        "react",
        "react-dom/client",
        "@lit/react",
        "@material/web/button/filled-button.js",
        "@material/web/button/outlined-button.js",
        "@material/web/textfield/outlined-text-field.js",
        "@material/web/switch/switch.js",
        "@material/web/iconbutton/icon-button.js",
      ],
    },
  }),
  webExt: {
    // Keep the dev server running without launching a browser or its debugger.
    // Firefox development defaults to manual loading under Bun.
    // dev:firefox:auto keeps automatic startup available for troubleshooting.
    disabled: process.env.DUXREADER_NO_BROWSER === "1",
  },
  manifest: ({ browser }) => ({
    name: "Duxreader",
    description: "Bring your desktop palette to the web.",
    permissions: [
      "storage",
      "nativeMessaging",
      "alarms",
      ...(browser === "firefox" ? ["theme" as const] : []),
    ],
    browser_specific_settings: {
      gecko: {
        // Must match allowed_extensions in the Firefox native host manifest.
        id: "duxreader@duxreader.local",
        data_collection_permissions: { required: ["none"] },
      },
    },
  }),
});
