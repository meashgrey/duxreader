import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    "chrome-id": { type: "string" },
    theme: { type: "string" },
    css: { type: "string" },
  },
});
if (values["chrome-id"] && !/^[a-p]{32}$/.test(values["chrome-id"]))
  throw new Error("Invalid Chrome extension ID");
const binary = resolve("target/release/duxreader-bridge");
await access(binary);
// Quote every argument for /bin/sh, including paths containing apostrophes.
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
// The popup can select a source later; an optional CLI path sets the default.
const command = [binary];
if (values.theme) command.push("--theme", resolve(values.theme));
if (values.css) command.push("--css", resolve(values.css));
const output = resolve(".output/native");
await mkdir(output, { recursive: true });
const launcher = resolve(output, "duxreader-host");
// Preserve Nix's portal library path for browsers launched outside nix develop.
const nativeLibraries = process.env.DUXREADER_LIBRARY_PATH;
const libraryExport = nativeLibraries
  ? "export LD_LIBRARY_PATH=" +
    quote(nativeLibraries) +
    "${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}\n"
  : "";
// Forward browser-provided arguments unchanged to the native host.
await writeFile(
  launcher,
  "#!/bin/sh\n" +
    libraryExport +
    "exec " +
    command.map(quote).join(" ") +
    ' "$@"\n',
  { mode: 0o755 },
);
const browsers: Record<
  string,
  { allowed_extensions?: string[]; allowed_origins?: string[] }
> = {
  // Firefox identifies the extension by its manifest ID; Chrome uses its origin.
  firefox: { allowed_extensions: ["duxreader@duxreader.local"] },
};
if (values["chrome-id"])
  browsers.chrome = {
    allowed_origins: [`chrome-extension://${values["chrome-id"]}/`],
  };
for (const [browser, allow] of Object.entries(browsers)) {
  // Generate locally for review; installation into browser directories is manual.
  const directory = resolve(output, browser);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "local.duxreader.bridge.json"),
    JSON.stringify(
      {
        name: "local.duxreader.bridge",
        description: "Duxreader theme bridge",
        path: launcher,
        type: "stdio",
        ...allow,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `Generated manifests in ${output}; see README.md for installation.`,
);
