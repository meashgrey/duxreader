# duxreader

Bring your desktop palette to web pages. Built with WXT, React, Material Design 3, and a Rust file-watching bridge.

## Development

```sh
git submodule update --init --recursive
nix develop path:.
bun install --frozen-lockfile
bun run dev
```

For Chrome/Chromium, use `bun run dev`. For Firefox, use `bun run dev:firefox`, open `about:debugging`, and load `.output/firefox-mv2-dev/manifest.json` as a temporary add-on. Pin Duxreader to the toolbar.

## Theme sources

- **Pywalfox** (Firefox): follow the active browser theme. No Duxreader bridge required.
- **Theme file**: watch Matugen JSON output. See the [template](examples/matugen/duxreader.json) and [configuration](examples/matugen/config.toml).

For file mode on Linux:

```sh
bun run build:bridge
bun run prepare:bridge
bun run install:bridge
```

Reload the extension, then select **Choose file**. The native chooser requires a working desktop portal. Chrome registration also needs `--chrome-id YOUR_EXTENSION_ID` during preparation and `--browser chrome` during installation.

## Checks and builds

```sh
bun run check
bun run test:browser # Requires Firefox
bun run benchmark:interaction # Requires a production build and Chromium
bun run build
bun run build:firefox
```

The pinned Dark Reader dynamic engine maps page colors to the Pywalfox/Matugen palette. Custom CSS remains supported. See [engine notes](scripts/engine/README.md).

Performance measurements and reproduction commands: [benchmarks](docs/performance.md).
