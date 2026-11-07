import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const metadata = await Bun.file(
  new URL("./upstream.json", import.meta.url),
).json();
const defaultRoot = fileURLToPath(
  new URL("../../vendor/vimium", import.meta.url),
);
const initialize =
  "Initialize the pinned dependency with: git submodule update --init --recursive";

// Verify the nested checkout so an empty submodule cannot fall back to the
// parent repository's Git metadata.
export async function verifyUpstream(root = defaultRoot) {
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", "-C", root, ...args]);
    if (result.exitCode)
      throw new Error(`Vimium submodule unavailable. ${initialize}`);
    return result.stdout.toString().trim();
  }
  if (git("rev-parse", "--show-toplevel") !== resolve(root))
    throw new Error(`Vimium submodule is not initialized. ${initialize}`);
  if (git("rev-parse", "HEAD") !== metadata.revision)
    throw new Error(
      `Vimium revision mismatch; expected ${metadata.revision}. ${initialize}`,
    );
  if (git("status", "--porcelain", "--untracked-files=normal"))
    throw new Error(
      "Vimium submodule contains local changes. Keep product changes in scripts/vimium/.",
    );
  const manifest = await Bun.file(resolve(root, "manifest.json")).text();
  const version = /"version"\s*:\s*"([^"]+)"/.exec(manifest)?.[1];
  if (version !== metadata.version)
    throw new Error(
      "Vimium version does not match scripts/vimium/upstream.json",
    );
  return { ...metadata, root };
}
