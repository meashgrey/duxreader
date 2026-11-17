import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// Chrome silently drops some suggested defaults (Alt+Shift+P among them), so a
// config value is not proof that a key ships. This guards the declaration; the
// accepted pair is verified by launching the built extension with
// `chrome.commands.getAll()`.
test("both picker commands declare distinct shortcuts", async () => {
  const source = await readFile("wxt.config.ts", "utf8");
  const preserve = source.match(
    /"start-preserve-picker":\s*\{\s*suggested_key:\s*\{\s*default:\s*"([^"]+)"/,
  );
  const map = source.match(
    /"start-map-picker":\s*\{\s*suggested_key:\s*\{\s*default:\s*"([^"]+)"/,
  );
  expect(preserve?.[1]).toBeTruthy();
  expect(map?.[1]).toBeTruthy();
  expect(preserve![1]).not.toBe(map![1]);
  // Chrome reserves several combos by default; these two were confirmed to
  // register in a launched extension.
  expect(preserve![1]).toBe("Alt+Shift+E");
  expect(map![1]).toBe("Alt+Shift+M");
});
