import { expect, test } from "bun:test";
import { installFirefoxChromeAlias } from "../lib/vimium/firefox-api.ts";

test("Firefox chrome calls use the promise-based browser namespace", () => {
  const browser = { runtime: { getURL: () => "moz-extension://id/" } };
  const api: { browser?: typeof browser; chrome?: unknown } = {
    browser,
    chrome: { callbackOnly: true },
  };
  installFirefoxChromeAlias(api);
  expect(api.chrome).toBe(browser);
});

test("Chrome and other pages keep the native chrome namespace", () => {
  const chrome = { callbackOnly: true };
  const api = {
    browser: { runtime: { getURL: () => "chrome-extension://id/" } },
    chrome,
  };
  installFirefoxChromeAlias(api);
  expect(api.chrome).toBe(chrome);
});
