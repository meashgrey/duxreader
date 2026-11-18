# Canvas background follow-ups

These are existing limitations reproduced on both main and PR #2, separate from
the per-frame theme rebuild regression.

- **More-specific important backgrounds:** verify late `html`/`body` backgrounds
  with IDs, classes and inline important declarations. A fixed-specificity
  fallback cannot win every page cascade. Explicit user mappings must retain
  priority over defaults.
- **Application canvases:** define how to identify a page canvas painted on an
  SPA container instead of `html`/`body`. A `#root` name alone does not establish
  that an element is the canvas; mapping all containers would flatten cards.

Future work should reuse upstream stylesheet processing or scoped site mappings.
Do not restore a document-wide observer that removes and recreates the theme on
page mutations. Add fixtures for these cases and rerun interaction benchmarks
against main before expanding the background policy.
