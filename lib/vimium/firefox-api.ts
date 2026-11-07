export interface ExtensionApi {
  runtime?: { getURL(path: string): string };
}

// Firefox exposes the promise-based API as `browser` and keeps `chrome` as a
// callback-compatible alias. Vimium awaits `chrome.*` throughout, so use the
// browser namespace there when the document runs in a moz-extension context.
export function installFirefoxChromeAlias(
  api: { browser?: ExtensionApi; chrome?: unknown } = globalThis as {
    browser?: ExtensionApi;
    chrome?: unknown;
  },
) {
  try {
    if (api.browser?.runtime?.getURL("").startsWith("moz-extension://"))
      api.chrome = api.browser;
  } catch {
    // Not a WebExtension context.
  }
}

installFirefoxChromeAlias();
