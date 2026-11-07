import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const { version } = await Bun.file("package.json").json();
assert(/^\d+\.\d+\.\d+$/.test(version), "Invalid release version");
const directory = resolve(".output/release", version);
if (!process.argv.includes("--checksums-only")) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [browser, filename, manifestVersion] of [
    ["chrome", "chromium-edge", 3],
    ["firefox", "firefox-unsigned", 2],
  ] as const) {
    const manifest = await Bun.file(
      `.output/${browser === "chrome" ? "chrome-mv3" : "firefox-mv2"}/manifest.json`,
    ).json();
    assert.equal(manifest.version, version);
    assert.equal(manifest.manifest_version, manifestVersion);
    assert(manifest.icons?.[128], "Extension icon missing");
    await copyFile(
      `.output/duxreader-${version}-${browser}.zip`,
      resolve(directory, `duxreader-${version}-${filename}.zip`),
    );
  }
  await copyFile(
    `.output/duxreader-${version}-sources.zip`,
    resolve(directory, `duxreader-${version}-sources.zip`),
  );
  await copyFile("docs/INSTALL.md", resolve(directory, "INSTALL.md"));
}
const files = (await readdir(directory))
  .filter((file) => file !== "SHA256SUMS")
  .sort();
const sums = await Promise.all(
  files.map(async (file) => {
    const hash = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(resolve(directory, file)).arrayBuffer())
      .digest("hex");
    return `${hash}  ${file}`;
  }),
);
await Bun.write(resolve(directory, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`Release ${version}: ${directory}`);
