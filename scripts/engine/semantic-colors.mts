import { siteInlineSelectors } from "./sites/index.mts";

// Shared Primer swatches keep their source colors while their containers and
// labels remain themed. Use component attributes rather than generated hashes.
const sharedInlineSelectors = [
  "[data-duxreader-preserve]",
  "[data-duxreader-preserve] *",
  ".repo-language-color",
  ".Progress-item",
  '[data-component="ProgressBar.Item"]',
];

export function getPreservedInlineSelectors(url: URL): string[] {
  return [...sharedInlineSelectors, ...siteInlineSelectors(url)];
}
