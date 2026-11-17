/**
 * A selector that crosses a shadow boundary is written as a host chain:
 *
 *   article.card >>> .badge
 *
 * CSS cannot pierce a shadow root, so the part after the last separator is
 * injected into the owning shadow root instead of the document. The separator
 * is only a storage format: rules are split before they reach the engine.
 */
export const SHADOW_SEPARATOR = " >>> ";

export interface ShadowSelectorParts {
  readonly hosts: readonly string[];
  readonly inner: string;
}

export function splitShadowSelector(
  selector: string,
): ShadowSelectorParts | null {
  if (!selector.includes(SHADOW_SEPARATOR)) return null;
  const parts = selector.split(SHADOW_SEPARATOR);
  const inner = parts.pop();
  if (!inner || parts.length === 0) return null;
  if (parts.some((part) => !part.trim())) return null;
  return { hosts: parts, inner };
}

export function joinShadowSelector(
  hosts: readonly string[],
  inner: string,
): string {
  return [...hosts, inner].join(SHADOW_SEPARATOR);
}
