import { access, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export function registrationDirectory(browser, platform, home, configHome) {
  if (platform !== "linux")
    throw new Error("Automatic registration currently supports Linux only.");
  if (browser === "firefox")
    return join(home, ".mozilla/native-messaging-hosts");
  const directory = { chrome: "google-chrome", chromium: "chromium" }[browser];
  if (!directory) throw new Error("Choose firefox, chrome, or chromium.");
  return join(
    configHome || join(home, ".config"),
    directory,
    "NativeMessagingHosts",
  );
}

export async function installManifest(source, destination) {
  const text = await readFile(source, "utf8");
  const manifest = JSON.parse(text);
  if (manifest.name !== "local.duxreader.bridge" || manifest.type !== "stdio") {
    throw new Error(
      "Unexpected native host manifest. Run bun run prepare:bridge first.",
    );
  }
  await access(manifest.path, constants.X_OK);
  await mkdir(dirname(destination), { recursive: true });
  let existing;
  try {
    existing = await readFile(destination, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing === text) return;
  // Preserve an existing registration before replacing its content.
  if (existing !== undefined) await copyFile(destination, destination + ".bak");
  await writeFile(destination, text, { mode: 0o644 });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { browser: { type: "string", default: "firefox" } },
  });
  const browser = values.browser;
  const target = registrationDirectory(
    browser,
    process.platform,
    homedir(),
    process.env.XDG_CONFIG_HOME,
  );
  const source = resolve(
    ".output/native",
    browser === "firefox" ? "firefox" : "chrome",
    "local.duxreader.bridge.json",
  );
  await installManifest(source, join(target, "local.duxreader.bridge.json"));
  console.log(`Registered Duxreader for ${browser}: ${target}`);
  console.log("Reload the extension, then select Choose file to reconnect.");
}
