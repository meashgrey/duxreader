# Dynamic engine

`vendor/darkreader` is an unmodified Git submodule pinned to the commit recorded in
`scripts/engine/upstream.json`. The parent repository tracks that same commit as a
gitlink. Color, network, and browser-world adapters live here, outside upstream.

```sh
git submodule update --init --recursive
bun install --frozen-lockfile
bun run engine:build
```

New clones can use `git clone --recurse-submodules`. Initialization requires network
access; later builds work offline. Builds require Git and reject a missing checkout,
a different revision, or local submodule changes. Both CI checkouts initialize submodules.

The build reuses upstream scheduling, stylesheet managers, variable analysis, and
inline handling. Adapters supply desktop colors and extension networking, select the
dedicated MAIN-world proxy for both browsers, and suppress inert CSS placeholder
output while retaining its dependency subscriptions and sharing its internal label.
Paid-feature hooks are disabled. The upstream MIT license ships in extension packages.

To upgrade, fetch upstream in `vendor/darkreader`, check out the reviewed commit,
update `upstream.json`, and stage both the gitlink and metadata. Run the build,
browser regressions, and performance comparisons before committing the upgrade.
Do not edit upstream to implement product features. Run `bun run engine:build` after
changing adapters; WXT watches the generated modules.
