import github from "./github/index.mts";
import type { SiteRules } from "./types.mts";

const rules: readonly SiteRules[] = [github];
const byHostname = new Map<string, SiteRules[]>();
for (const rule of rules) {
  for (const hostname of rule.hostnames) {
    const entries = byHostname.get(hostname) ?? [];
    entries.push(rule);
    byHostname.set(hostname, entries);
  }
}

// Match once per palette application, outside the interaction path. Multiple
// route-specific modules may register the same host without replacing others.
export function siteInlineSelectors(url: URL): readonly string[] {
  return (byHostname.get(url.hostname) ?? [])
    .filter(
      (rule) =>
        !rule.paths ||
        rule.paths.some((path) => new RegExp(path).test(url.pathname)),
    )
    .flatMap((rule) => rule.preserveInline);
}
