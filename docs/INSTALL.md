# Install Duxreader 0.1.0

Download the test packages from the [0.1.0 release](https://github.com/meashgrey/duxreader/releases/tag/v0.1.0).

## Chromium and Microsoft Edge

1. Download and extract `duxreader-0.1.0-chromium-edge.zip` to a permanent folder.
2. Open `chrome://extensions` (Chrome/Chromium) or `edge://extensions` (Edge).
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin Duxreader to the toolbar.

Keep the folder in place. Install updates by extracting the new package there and choosing **Reload** on the extensions page. These packages are not Chrome Web Store or Edge Add-ons listings.

## Firefox

The initial test release is unsigned:

1. Download and extract `duxreader-0.1.0-firefox-unsigned.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.
4. Pin Duxreader to the toolbar.

Firefox removes temporary add-ons when it closes. A ZIP renamed to `.xpi` does not bypass signing. If the release includes `duxreader-0.1.0-firefox-signed.xpi`, install that file through **Install Add-on From File** in `about:addons` for persistent installation.

## Colors

On Firefox, choose **Browser theme** to follow Pywalfox without installing the Duxreader bridge.

For theme-file mode, install the Rust bridge from source on Linux:

```sh
git clone --recurse-submodules --branch v0.1.0 https://github.com/meashgrey/duxreader.git
cd duxreader
nix develop path:.
bun install --frozen-lockfile
bun run build:bridge
bun run prepare:bridge
bun run install:bridge
```

For Chromium or Edge, copy the extension ID from the browser's extensions page and register the bridge for that browser:

```sh
bun run prepare:bridge --chrome-id YOUR_EXTENSION_ID
bun run install:bridge --browser chromium
# Alternatives: --browser chrome or --browser edge
```

Reload Duxreader and choose the Matugen JSON file in the popup. The chooser needs a working desktop portal. Native host registration currently supports Linux; the extension packages themselves are browser packages.

## Verify downloads

Download `SHA256SUMS` next to the archives, then run:

```sh
sha256sum --ignore-missing --check SHA256SUMS
```
