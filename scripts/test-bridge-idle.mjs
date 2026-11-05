import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir, endianness } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const directory = await mkdtemp(join(tmpdir(), "duxreader-idle-"));
const child = spawn(resolve("target/release/duxreader-bridge"), [], {
  env: { ...process.env, XDG_CONFIG_HOME: directory },
});
let buffer = Buffer.alloc(0);
const messages = [];
let logs = "";
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length =
      endianness() === "LE" ? buffer.readUInt32LE() : buffer.readUInt32BE();
    if (buffer.length < length + 4) break;
    messages.push(JSON.parse(buffer.subarray(4, length + 4).toString()));
    buffer = buffer.subarray(length + 4);
  }
});
async function waitFor(predicate) {
  for (let i = 0; i < 120; i++) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${logs}`);
}
try {
  await waitFor(() => messages.length > 0);
  assert.equal(messages[0].type, "idle");
  assert.equal(logs, "", "An absent first-run default must not log an error");
  const config = join(directory, "duxreader");
  await mkdir(config);
  const theme = await Bun.file("examples/theme.json").json();
  await writeFile(join(config, "theme.json"), JSON.stringify(theme));
  await waitFor(() => messages.at(-1)?.type === "theme");
  await rm(join(config, "theme.json"));
  await waitFor(() => messages.at(-1)?.type === "error");
  child.stdin.end();
  await waitFor(() => child.exitCode === 0);
  console.log(
    "First-run test passed: idle without errors, automatic file discovery, and errors after a watched file disappears.",
  );
} finally {
  if (child.exitCode === null) child.kill();
  await rm(directory, { recursive: true, force: true });
}
