import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const metadata = await Bun.file(
  new URL("./upstream.json", import.meta.url),
).json();
const defaultRoot = fileURLToPath(
  new URL("../../vendor/darkreader", import.meta.url),
);
const initialize =
  "Initialize the pinned dependency with: git submodule update --init --recursive";

// Verify the actual nested checkout, not the parent repository that Git would
// otherwise discover when a submodule directory is empty or uninitialized.
export async function verifyUpstream(root = defaultRoot) {
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", "-C", root, ...args]);
    if (result.exitCode)
      throw new Error(`Dark Reader submodule unavailable. ${initialize}`);
    return result.stdout.toString().trim();
  }
  if (git("rev-parse", "--show-toplevel") !== resolve(root))
    throw new Error(`Dark Reader submodule is not initialized. ${initialize}`);
  if (git("rev-parse", "HEAD") !== metadata.revision)
    throw new Error(
      `Dark Reader revision mismatch; expected ${metadata.revision}. ${initialize}`,
    );
  if (git("status", "--porcelain", "--untracked-files=normal"))
    throw new Error(
      "Dark Reader submodule contains local changes. Keep product changes in scripts/engine/.",
    );
  const pkg = await Bun.file(resolve(root, "package.json")).json();
  if (pkg.version !== metadata.version)
    throw new Error(
      "Dark Reader version does not match scripts/engine/upstream.json",
    );
  return { ...metadata, root, source: resolve(root, "src") };
}
