import { expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installManifest,
  registrationDirectory,
} from "../scripts/install-bridge.mts";

test("registration paths follow each browser convention", () => {
  expect(
    registrationDirectory("firefox", "linux", "/users/example", "/config"),
  ).toBe("/users/example/.mozilla/native-messaging-hosts");
  expect(
    registrationDirectory("chrome", "linux", "/users/example", "/config"),
  ).toBe("/config/google-chrome/NativeMessagingHosts");
  expect(() =>
    registrationDirectory("unknown", "linux", "/users/example"),
  ).toThrow();
});

test("installation preserves a previous registration and is repeatable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "duxreader-install-"));
  try {
    const source = join(directory, "source.json");
    const target = join(directory, "hosts/local.duxreader.bridge.json");
    const text = JSON.stringify({
      name: "local.duxreader.bridge",
      type: "stdio",
      path: process.execPath,
    });
    await writeFile(source, text);
    await installManifest(source, target);
    expect(await readFile(target, "utf8")).toBe(text);
    await writeFile(target, "old registration");
    await installManifest(source, target);
    expect(await readFile(target + ".bak", "utf8")).toBe("old registration");
    await installManifest(source, target);
    expect(await readFile(target + ".bak", "utf8")).toBe("old registration");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
