# duxreader

Sync web page colors with dux-shell using WXT, React, TypeScript, and a Rust Native Messaging bridge.

This project provides a working foundation: the bridge watches theme JSON and external CSS files, and the extension caches the latest valid theme and updates open HTTP/HTTPS pages. The popup provides a global toggle, palette preview, and connection status.

Wallpaper manager integration, image palette extraction, Dark Reader-style automatic recoloring, per-site rule editing, and browser toolbar theming are not implemented yet. The current stylesheet covers page backgrounds, body text, and links; complex websites require additional CSS.

## Development

```sh
# Use path:. during initialization so Nix includes files not yet added to Git.
nix develop path:.
bun install --frozen-lockfile
bun run dev
# Or: bun run dev:firefox
```

Once the project files are added to Git, you can use `nix develop` directly. Optionally use direnv to load `.envrc`. The development environment includes Bun, Rust, Cargo, rustfmt, Clippy, and rust-analyzer. Nix, Bun, and Cargo dependencies have lockfiles.

```sh
bun run check
bun run test:bridge:integration
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
bun run build:bridge
```

Chrome builds are written to `.output/chrome-mv3`; Firefox builds use `.output/firefox-mv2`, following WXT's default targets. Run `bun run zip` or `bun run zip:firefox` to create extension archives. For Firefox development, temporarily load the generated manifest through `about:debugging`. Production distribution requires signing.

### Bun runtime

Bun is the package manager and JavaScript runtime for this project. `bunfig.toml` sets `run.bun = true`, so dependency CLIs use Bun even when they have a Node.js shebang. Use `bun install --frozen-lockfile` for reproducible installs; `bun.lock` is the JavaScript dependency lockfile. Rust bridge commands still require Cargo and the Rust toolchain provided by the Nix shell.

### Manual Firefox development

If automatic browser startup fails with `ECONNREFUSED`, use:

```sh
bun run dev:firefox:manual
```

Keep the development server running, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `.output/firefox-mv2-dev/manifest.json`. Reload the temporary extension after restarting the development server. This bypasses the automatic debugger connection; it does not fix or diagnose its underlying failure.

## Connect the local bridge on Linux

Build both extensions and the Rust bridge. In Chrome, load the unpacked build directory through `chrome://extensions` and copy the extension ID.

```sh
bun run build
bun run build:firefox
bun run build:bridge
bun run prepare:bridge --theme "$PWD/examples/theme.json" --css "$PWD/examples/custom.css" --chrome-id YOUR_CHROME_EXTENSION_ID
```

Omit `--chrome-id` to generate only the Firefox registration manifest. The script creates a launcher and manifests under `.output/native/` without modifying browser directories.

Register the bridge with Chrome:

```sh
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
cp .output/native/chrome/local.duxreader.bridge.json ~/.config/google-chrome/NativeMessagingHosts/
```

For Chromium, use `~/.config/chromium/NativeMessagingHosts/`. For Firefox:

```sh
mkdir -p ~/.mozilla/native-messaging-hosts
cp .output/native/firefox/local.duxreader.bridge.json ~/.mozilla/native-messaging-hosts/
```

After registration, reload the extension or wait up to one minute for automatic reconnection. Keep the repository and release executable at their original paths. If you move them, regenerate and copy the manifests again. Flatpak/Snap browsers and macOS/Windows require platform-specific registration or sandbox integration, which has not been verified.

Edit `examples/theme.json` or `examples/custom.css` to update open pages. For actual integration, point `--theme` at the theme file exported by dux-shell. See [examples/theme.json](examples/theme.json) for the schema; colors must use six-digit hexadecimal notation. External CSS can reference `--dux-bg`, `--dux-surface`, `--dux-fg`, and `--dux-accent`.

## Architecture and integration

```text
dux-shell wallpaper change → shell exports theme JSON
                                      ↓
                        Rust bridge watches JSON and CSS
                                      ↓ Native Messaging
                        WXT background validates and caches palette
                                      ↓ storage.onChanged
                        Content script updates page CSS
```

The bridge uses `notify` to watch parent directories and detect atomic file replacements. It re-resolves symlink targets and checks every two seconds to recover from missed events. Invalid configuration preserves the last valid theme and is retried. Logs go to stderr; stdout carries only length-prefixed Native Messaging JSON. The bridge exits when the browser closes its input pipe. Each browser connection owns a separate bridge process.

Initially, dux-shell handles wallpaper-to-palette generation so components share the same colors. The bridge currently starts with the browser connection rather than running as an independent service. To extract wallpaper colors while browsers are closed, a future user daemon can maintain the palette, with the Native Messaging host connecting through a local socket.

Custom styles are treated as ordinary CSS and applied to every matched page. Stylus UserCSS and `@-moz-document` syntax are not parsed. The extension requests content-script access to ordinary websites, along with storage, nativeMessaging, and alarms permissions. The local bridge only reads configured files and does not expose file access or command execution to websites.

References: [WXT](https://wxt.dev/guide/installation), [Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), and [notify](https://docs.rs/notify/latest/notify/).
