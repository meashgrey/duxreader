export interface SiteRules {
  readonly hostnames: readonly string[];
  readonly paths?: readonly RegExp[];
  readonly preserveInline: readonly string[];
}
