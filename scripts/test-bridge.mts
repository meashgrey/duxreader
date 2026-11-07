import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir, endianness } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const directory = await mkdtemp(join(tmpdir(), "duxreader-"));
const themePath = join(directory, "theme.json");
const cssPath = join(directory, "custom.css");
const theme = JSON.parse(await readFile("examples/theme.json", "utf8"));
await writeFile(themePath, JSON.stringify(theme));
await writeFile(cssPath, "body { color: var(--dux-fg); }");
const child = spawn(resolve("target/release/duxreader-bridge"), [
  "--theme",
  themePath,
  "--css",
  cssPath,
]);
const messages: import("../lib/theme").Theme[] = [];
const errors: { source: string }[] = [];
let buffer = Buffer.alloc(0);
child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length =
      endianness() === "LE" ? buffer.readUInt32LE() : buffer.readUInt32BE();
    if (buffer.length < length + 4) break;
    const message = JSON.parse(buffer.subarray(4, length + 4).toString());
    if (message.type === "theme") messages.push(message.theme);
    if (message.type === "error") errors.push(message);
    buffer = buffer.subarray(length + 4);
  }
});
let logs = "";
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(`Bridge timed out: ${logs}`);
}
try {
  await waitFor(() => messages.length === 1);
  assert.equal(messages[0]!.colors.accent, theme.colors.accent);
  theme.colors.accent = "#ff0000";
  await writeFile(join(directory, "next.json"), JSON.stringify(theme));
  await rename(join(directory, "next.json"), themePath);
  await waitFor(() => messages.at(-1)?.colors.accent === "#ff0000");
  await writeFile(cssPath, "/* Updated palette 🎨 */");
  await waitFor(() => messages.at(-1)?.css === "/* Updated palette 🎨 */");
  const count = messages.length;
  await writeFile(themePath, "{");
  await delay(400);
  assert.equal(
    messages.length,
    count,
    "Invalid JSON must not replace the valid theme",
  );
  await waitFor(() => errors.length > 0);
  // Restoring identical content must clear the reported file error as well.
  await writeFile(themePath, JSON.stringify(theme));
  await waitFor(() => messages.length > count);
  theme.colors.accent = "#00ff00";
  await writeFile(themePath, JSON.stringify(theme));
  await waitFor(() => messages.at(-1)?.colors.accent === "#00ff00");
  const selected = join(directory, "selected.json");
  theme.colors.accent = "#123456";
  await writeFile(selected, JSON.stringify(theme));
  function select(path: string | null) {
    const payload = Buffer.from(JSON.stringify({ type: "watch", path }));
    const header = Buffer.alloc(4);
    if (endianness() === "LE") header.writeUInt32LE(payload.length);
    else header.writeUInt32BE(payload.length);
    child.stdin.write(Buffer.concat([header, payload]));
  }
  select(selected);
  await waitFor(() => messages.at(-1)?.colors.accent === "#123456");
  const selectedCount = messages.length;
  theme.colors.accent = "#654321";
  await writeFile(themePath, JSON.stringify(theme));
  await delay(300);
  assert.equal(
    messages.length,
    selectedCount,
    "Old source must no longer publish updates",
  );
  select(join(directory, "missing.json"));
  await waitFor(() => errors.at(-1)?.source.endsWith("missing.json") === true);
  await writeFile(join(directory, "missing.json"), JSON.stringify(theme));
  await waitFor(() => messages.at(-1)?.colors.accent === "#654321");
  select(null);
  await waitFor(() => messages.length > selectedCount + 1);
  child.stdin.end();
  await waitFor(() => child.exitCode === 0);
  console.log(
    "Bridge smoke test passed: initial snapshot, atomic replacement, CSS update, invalid-write recovery, EOF shutdown.",
  );
} finally {
  if (child.exitCode === null) child.kill();
  await rm(directory, { recursive: true, force: true });
}
