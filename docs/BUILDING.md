# Build release packages

Use Git, Bun 1.4.2 or newer, and the pinned submodules. Build scripts verify Git metadata and reject modified upstream checkouts. Clone the release tag to obtain that metadata; the release source ZIP is provided for source review.

```sh
git clone --recurse-submodules --branch v0.1.0 https://github.com/meashgrey/duxreader.git
cd duxreader
bun install --frozen-lockfile
bun run release:pack
```

Archives, installation instructions and checksums are written to `.output/release/0.1.0/`. Chromium and Edge share the Manifest V3 package; Firefox uses Manifest V2. Icons, the Dark Reader engine and Vimium bundles are generated from their checked-in sources and pinned submodules. No proprietary dependencies are needed.

For the optional Linux native bridge, use `nix develop path:.` and `bun run build:bridge`. Ubuntu builds require `pkg-config` and `libwayland-dev`.

## Publish and sign

Push a `v*` tag matching `package.json` to run the Release workflow. It runs checks and publishes GitHub Release assets. The workflow can also be run manually against an existing tag.

Without Mozilla credentials it publishes an explicitly unsigned Firefox test ZIP. To enable Mozilla signing, configure repository Actions secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` from your Mozilla Add-ons API credentials. The workflow uses `web-ext sign --channel unlisted`, uploads the source archive, and attaches the returned signed XPI. Signing can require Mozilla review; a failed signing request fails the release job.

These steps publish a GitHub Release, not browser-store listings.
