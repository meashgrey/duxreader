# duxreader

Bring your desktop palette to web pages. Built with WXT, React, Material Design 3, and a Rust file-watching bridge.

## Development

```sh
nix develop path:.
bun install --frozen-lockfile
bun run dev:firefox
```

In Firefox, open `about:debugging`, load `.output/firefox-mv2-dev/manifest.json` as a temporary add-on, and pin Duxreader to the toolbar. Use `bun run dev` for Chrome.

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
bun run build
bun run build:firefox
```

Page colors map directly to the Pywalfox/Matugen palette, with continuous DOM and style monitoring. Custom CSS remains supported. See [rendering notes](docs/rendering.md).

Performance measurements and reproduction commands: [benchmarks](docs/performance.md).
