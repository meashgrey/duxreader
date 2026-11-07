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
    host_permissions: ["<all_urls>"],
    // Vimium's background and content scripts use these browser APIs. The
    // favicon permission is Chrome-only; Firefox adds clipboard permissions.
    permissions: [
      "storage",
      "nativeMessaging",
      "alarms",
      "tabs",
      "bookmarks",
      "history",
      "sessions",
      "notifications",
      "scripting",
      "webNavigation",
      "search",
      ...(browser === "firefox"
        ? ["theme" as const, "clipboardRead" as const, "clipboardWrite" as const]
        : ["favicon" as const]),
    ],
    options_ui: {
      page: "pages/options.html",
      browser_style: false,
      open_in_tab: true,
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["vimium/content.js"],
        css: ["content_scripts/vimium.css"],
        run_at: "document_start",
        all_frames: true,
        match_about_blank: true,
      },
      {
        matches: ["file:///", "file:///*/"],
        css: ["content_scripts/file_urls.css"],
        run_at: "document_start",
        all_frames: true,
      },
    ],
    web_accessible_resources: [
      {
        resources: [
          "vomnibar.html",
          "hud.html",
          "help.html",
          "pages/*",
          "content_scripts/vimium.css",
          "resources/tlds.txt",
          "_favicon/*",
        ],
        matches: ["<all_urls>"],
      },
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
