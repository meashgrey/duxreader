// GitHub opens search through same-document navigation. These semantic
// swatches stay protected across its routes, including dynamically inserted UI.
export default [
  // Result footers identify the adjacent language name with an ARIA label.
  'li:has(> [aria-label$=" language"]) > span > [style*="background-color"]',
  // Language facets encode their value in the search link. Preserve only
  // the leading color swatch; the filter label continues to be themed.
  'a:is([href*="language%3A" i], [href*="language:"]) [data-component="ActionList.LeadingVisual"] > [style*="background-color"]',
  // Language suggestions when search on Github
  'span:is([class*="suggestion-item-module"][data-testid="language-color-icon"])',
] as const;
