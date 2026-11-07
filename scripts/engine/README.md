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

Semantic swatches keep their source inline colors through upstream's ignore rules.
`semantic-colors.mts` recognizes legacy Primer swatches and React ProgressBar items without
exempting their containers or labels. GitHub React language dots use a scoped rule
based on language-search links rather than CSS module hashes. Other inline visualizations can use
`data-duxreader-preserve`. This is explicit component recognition, not automatic
semantic detection; stylesheet-only colors need additional framework rules.

Site rules live in `sites/<site>/`: the site index declares hostnames and groups
page-specific modules such as `github/repository.mts` and `github/search.mts`.
Rules can also declare optional pathname patterns. The registry matches them once per palette application.
Keep shared component rules in `semantic-colors.mts`.

Run all registered live-site cases with the production Chromium extension:

```sh
bun run build
bun run test:sites
bun run test:sites --list
bun run test:sites --site github
bun run test:sites --site github-search
bun run test:sites --site github --url https://github.com/OWNER/REPO
```

Cases in `tests/sites/cases/**/*.site.mts` are discovered automatically,
including nested site folders such as `cases/github/`. GitHub repository and search cases check
language colors in legends, result footers, and filter facets, NixOS Wiki checks the document surface, and MDN checks document
text and theming. Each case gets an isolated browser profile. Failures do not skip
later cases; the command exits unsuccessfully if any case fails. Screenshots and
per-site JSON reports are written under `.temp/sites`, with an aggregate report.
These tests require network access and Chromium (`nix develop path:.` on NixOS).
Live tests remain separate from deterministic CI fixtures.
