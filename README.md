# duxreader

Sync web page colors with dux-shell using WXT, React, TypeScript, and a Rust Native Messaging bridge.

This project provides a working foundation: the bridge watches theme JSON and external CSS files, and the extension caches the latest valid theme and updates open HTTP/HTTPS pages. Pin the extension to the browser toolbar and open its popup to select a local theme path. The popup uses official Material Web Material Design 3 components and follows the same Matugen palette as web pages and provides a global page toggle, palette preview, source status, and file errors. Source preferences and the last valid theme persist across browser restarts.

Direct wallpaper manager integration, image palette extraction, Dark Reader-style automatic recoloring, per-site rule editing, and browser toolbar theming are not implemented yet. The current stylesheet covers page backgrounds, body text, and links; complex websites require additional CSS.

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

### Firefox development and popup access

Firefox development defaults to manual loading, avoiding the failing automatic debugger connection observed with Bun and web-ext. Start the server with:

```sh
bun run dev:firefox
```

Keep the development server running, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `.output/firefox-mv2-dev/manifest.json`. Confirm that **Duxreader** appears under temporary extensions. A successful build alone does not install the extension.

To open the popup, select Firefox's extensions button (the puzzle-piece icon), find **Duxreader**, and click its name. Use the gear menu beside it and select **Pin to Toolbar** to keep its button visible; clicking that toolbar button opens the popup. The popup is an extension page, not the development server's localhost homepage.

Reload the temporary extension after restarting the development server. Firefox removes temporary extensions when it exits, so load the manifest again next session. `bun run dev:firefox:manual` remains an alias for this workflow. `bun run dev:firefox:auto` opts into web-ext automatic browser startup for troubleshooting. Manual loading bypasses the automatic debugger connection; it does not fix or diagnose its underlying failure.

## Follow Firefox / Pywalfox

Duxreader can use the active Firefox extension theme as its page palette. Pywalfox continues to apply Firefox's browser UI colors, and Duxreader reads that result through Firefox's `theme.getCurrent()` and `theme.onUpdated` APIs. Duxreader never calls `theme.update()`, changes Pywalfox settings, or impersonates another extension's ID.

1. Configure Pywalfox with your existing Pywal-compatible Matugen output and apply it using **Fetch Pywal colors** or `pywalfox update`.
2. Reload Duxreader after upgrading so Firefox grants its new `theme` permission.
3. In the Duxreader popup, select **Pywalfox**. Pywalfox's subsequent theme updates propagate to the popup and ordinary web pages.

This source does not require Duxreader's Rust bridge or a second theme file. Pywalfox still needs its own native host. New Firefox installs default to this source; existing custom file paths keep file mode. Chrome retains the native file workflow because it has no equivalent Firefox Theme API. Selecting **Theme file** restores the existing Matugen file selector and full Material role support.

The browser adapter maps Pywalfox's `ntp_background`, `ntp_text`, `popup`/`toolbar`, and `icons` colors to page background, text, surfaces, and accents. Firefox's active theme includes Pywalfox palette and browser-template overrides, so these effective colors can differ from the raw Pywal file. Other extension-supplied Firefox themes also work; the API does not identify which extension produced a theme. Per-window overrides are not synchronized globally. If no usable extension theme is present, Duxreader waits and removes page overrides instead of inventing a palette. Browser mode exposes four palette roles; exact full MD3 roles remain available through the Matugen file source.

The current page renderer exports CSS variables and basic background/text/link overrides. It does not yet implement Dark Reader's automatic stylesheet analysis or Stylus-style per-site rule management.

### Findings from the local reference sources

- Pywalfox's `src/background/extension.ts` applies browser colors using `theme.update()`.
- Its `src/background/generators.ts` also builds Dark Reader background/text theme parameters. `src/communication/darkreader-messenger.ts` sends those settings to the hard-coded `addon@darkreader.org` extension ID. It does not send arbitrary CSS.
- The local Dark Reader tree has internal messaging handlers, but no `runtime.onConnectExternal` or `runtime.onMessageExternal` receiver was found for that integration. Compatibility with an installed Dark Reader release must not be assumed from the Pywalfox sender alone.
- Dark Reader's public API offers a dynamic page rendering engine; Stylus separates user-style management from content-script injection. These are references for future rendering and per-site rules. This integration copies no source from those projects and does not modify the `.temp/` checkouts.

## First release: follow a Matugen theme

1. Build and register the Rust bridge using the instructions below. Rebuild an older bridge before using the popup source selector; the protocol now supports source changes and error messages.
2. Add the Duxreader template to the Matugen configuration that dux-shell actually uses. Merge [examples/matugen/config.toml](examples/matugen/config.toml) into that configuration and set its `input_path` to the absolute path of [examples/matugen/duxreader.json](examples/matugen/duxreader.json).
3. Create the output directory (`mkdir -p ~/.config/duxreader`) and trigger dux-shell's normal wallpaper/theme regeneration. Matugen writes `~/.config/duxreader/theme.json` using the current mode and palette.
4. Pin Duxreader through the browser's extensions menu. In Firefox, use **Pin to Toolbar**; in Chrome, select the pin beside Duxreader.
5. Click the toolbar icon and select **Choose file** to open the system file chooser. Select the Matugen output JSON to start watching automatically. Alternatively, expand **Enter path** and enter `~/.config/duxreader/theme.json` in **Theme file path** and select **Apply path**. The status changes to **Live** once a valid theme has been received.

The native chooser is opened by the Rust bridge using `rfd`; it returns the real local path needed for continuous watching. The background saves the result even if opening the chooser dismisses the popup. Reopen the popup after selecting a file to see its status. Cancelling preserves the current source. The path field also accepts an absolute path or one starting with `~/`. No theme data is uploaded. Leaving the field empty restores the bridge's default source. Selecting a new path switches the existing host's watch without reinstalling its manifest.

Changing the wallpaper through dux-shell will update both the popup and open web pages when its Matugen run includes this template. The template maps `surface`, `surface_container`, `on_surface`, and `primary` to Duxreader's four page palette roles. It also exports a `material` map with Material 3 color roles for the popup, including primary/on-primary, containers, surfaces, outlines, and error colors. These Matugen colors are used directly as `--md-sys-color-*` tokens; no browser-generated seed palette replaces them. Legacy four-color JSON files remain supported through fallback role mappings. It was verified with the local Matugen CLI; dux-shell's configuration location and regeneration command depend on your installation.

On a fresh install, an absent conventional default theme is an idle state: the popup asks you to choose a file and the bridge keeps checking for Matugen output without logging an error. An explicitly selected path (or a default explicitly configured with `--theme`) that is missing or invalid reports a file error. Removing a file that has already been applied also reports an error. The last applied palette is preserved while the bridge retries. Fixing the file restores the live state, including when its colors are unchanged. **Theme web pages** controls page styling independently; the popup always follows the palette. Browser settings pages and extension stores may block content scripts.

## Connect the local bridge on Linux

Build both extensions and the Rust bridge. In Chrome, load the unpacked build directory through `chrome://extensions` and copy the extension ID.

```sh
bun run build
bun run build:firefox
bun run build:bridge
bun run prepare:bridge --chrome-id YOUR_CHROME_EXTENSION_ID
# Register with Firefox (default):
bun run install:bridge
# Or: bun run install:bridge --browser chrome
# Or: bun run install:bridge --browser chromium
```

Omit `--chrome-id` to generate only the Firefox registration manifest. Optionally supply `--theme PATH` to set the bridge default (otherwise `~/.config/duxreader/theme.json`) and `--css PATH` to watch an external stylesheet. The popup selection overrides the default theme path. The script creates a launcher and manifests under `.output/native/` without modifying browser directories.

On Linux, the native chooser requires a running desktop session with a working `xdg-desktop-portal` FileChooser backend (such as the GTK or KDE portal configured by your desktop). The Nix shell supplies Wayland build dependencies and records the dynamically loaded D-Bus library path in the generated launcher. Run bridge preparation inside `nix develop` on NixOS, then copy the regenerated manifest as described below. The chooser's own appearance follows your desktop/portal provider; Material Design 3 applies to the extension popup.

The install command writes the generated manifest to the browser's user-level registration directory. Merely running `prepare:bridge` does not register the host. Existing registrations are backed up to `.bak` before replacement. If a chooser request immediately disconnects, first check that registration exists.

Alternatively, register the bridge manually with Chrome:

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

For a quick local test, select the absolute path to `examples/theme.json` in the popup, then edit its colors. For actual integration, select the file exported by the Matugen template. External CSS is watched when configured with `--css` during bridge preparation. See [examples/theme.json](examples/theme.json) for the schema; colors must use six-digit hexadecimal notation. External CSS can reference `--dux-bg`, `--dux-surface`, `--dux-fg`, and `--dux-accent`.

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

Initially, dux-shell handles wallpaper-to-palette generation so components share the same colors. The bridge currently starts with the browser connection rather than running as an independent service. To extract wallpaper colors while browsers are closed, a future user daemon can maintain the palette, with the Native Messaging host connecting through a local socket. The extension sends `{ "type": "watch", "path": "/absolute/theme.json" }` to switch sources, or `null` as the path to restore the host default. The host emits `theme` and `error` messages tagged with the requested source, so stale updates can be discarded.

Custom styles are treated as ordinary CSS and applied to every matched page. Stylus UserCSS and `@-moz-document` syntax are not parsed. The extension requests content-script access to ordinary websites, along with storage, nativeMessaging, and alarms permissions. The local bridge only reads configured files and does not expose file access or command execution to websites.

References: [WXT](https://wxt.dev/guide/installation), [Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), and [notify](https://docs.rs/notify/latest/notify/).

## Material Design 3 components

The popup uses [Material Web](https://github.com/material-components/material-web) and the official Lit React adapter. Components are bundled locally; no CDN, remote fonts, or external runtime scripts are required. Material Web is in maintenance mode; the project uses its released MD3 controls through a small adapter in `components/material.ts` so they can be replaced independently if needed.

After upgrading from the earlier four-color template, regenerate your Matugen output using the updated template to supply the full MD3 role set. Rebuild the bridge and regenerate its launcher to enable native file selection. Automated tests cover background persistence/cancellation and Matugen role validation, but native dialogs still need a desktop-session check on your installation.
