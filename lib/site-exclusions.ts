export const EXCLUDED_SITES_KEY = "excludedSites";

// Blacklist entries are hostnames, never paths. Treat www.example.com and
// example.com as the same site so the popup toggle is stable across redirects.
export function normalizeSite(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function siteForUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return undefined;
    return normalizeSite(parsed.hostname);
  } catch {
    return undefined;
  }
}

export function readExcludedSites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const sites = value
    .filter(
      (item): item is string =>
        typeof item === "string" &&
        item.length > 0 &&
        !item.includes("/") &&
        !item.includes(" "),
    )
    .map(normalizeSite)
    .filter(Boolean);
  return [...new Set(sites)].sort();
}

export function isSiteExcluded(value: unknown, site: string | undefined) {
  return site ? readExcludedSites(value).includes(normalizeSite(site)) : false;
}

export function setSiteExcluded(
  value: unknown,
  site: string,
  excluded: boolean,
): string[] {
  const sites = new Set(readExcludedSites(value));
  const normalized = normalizeSite(site);
  if (excluded) sites.add(normalized);
  else sites.delete(normalized);
  return [...sites].sort();
}

// A page can embed cross-origin frames (for example GitHub's rendered
// Markdown). Use the top page's hostname so disabling a site also disables
// its embedded theme work.
export function siteForFrame(): string | undefined {
  if (window.top === window) return siteForUrl(location.href);
  try {
    const top = window.top?.location.href;
    if (top) return siteForUrl(top);
  } catch {
    // Cross-origin top frame.
  }
  const ancestor = (
    location as Location & { ancestorOrigins?: ArrayLike<string> }
  ).ancestorOrigins?.[0];
  if (ancestor) return siteForUrl(ancestor);
  if (document.referrer) return siteForUrl(document.referrer);
  return siteForUrl(location.href);
}
