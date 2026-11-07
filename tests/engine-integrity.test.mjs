import { expect, test } from "bun:test";
import { verifyUpstream } from "../scripts/engine/upstream.mjs";

test("the engine uses the clean, pinned upstream submodule", async () => {
  const upstream = await verifyUpstream();
  const entry = Bun.spawnSync([
    "git",
    "ls-files",
    "--stage",
    "vendor/darkreader",
  ]);
  expect(entry.exitCode).toBe(0);
  expect(entry.stdout.toString().trim()).toBe(
    `160000 ${upstream.revision} 0\tvendor/darkreader`,
  );
  expect(await Bun.file("public/third-party/darkreader-MIT.txt").text()).toBe(
    await Bun.file("vendor/darkreader/LICENSE").text(),
  );
});

test("an uninitialized dependency gives an actionable error", async () => {
  await expect(verifyUpstream("vendor")).rejects.toThrow(
    "git submodule update --init --recursive",
  );
});
