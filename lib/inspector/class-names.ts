const genericPrefixes = new Set([
  "css",
  "sc",
  "jsx",
  "tsx",
  "svelte",
  "vue",
  "emotion",
  "styled",
  "style",
  "styles",
  "module",
  "modules",
]);

const statePrefixes = new Set([
  "selected",
  "active",
  "open",
  "closed",
  "disabled",
  "checked",
  "focus",
  "focused",
  "hover",
  "hovered",
  "expanded",
  "collapsed",
  "loading",
  "hidden",
  "visible",
  "current",
  "highlighted",
]);

interface Segment {
  readonly text: string;
  readonly start: number;
}

function segmentsOf(token: string): Segment[] {
  const segments: Segment[] = [];
  const matcher = /[A-Za-z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(token))) {
    segments.push({ text: match[0], start: match.index });
  }
  return segments;
}

function caseTransitions(text: string): number {
  let count = 0;
  for (let index = 1; index < text.length; index++) {
    const previous = text[index - 1]!;
    const current = text[index]!;
    if (/[A-Za-z]/.test(previous) && /[A-Za-z]/.test(current)) {
      if (
        previous === previous.toUpperCase() &&
        current === current.toLowerCase()
      )
        count++;
      else if (
        previous === previous.toLowerCase() &&
        current === current.toUpperCase()
      )
        count++;
    }
  }
  return count;
}

/**
 * Scores how much a string looks like a build-generated suffix (CSS module
 * hash, styled-components id, Primer token hash). Short mixed-case segments
 * with digits or low vowel density score high.
 */
export function generatedScore(text: string): number {
  const value = text.replace(/[^A-Za-z0-9]/g, "");
  if (value.length < 4 || value.length > 32) return 0;
  const upper = /[A-Z]/.test(value);
  const lower = /[a-z]/.test(value);
  const digits = /\d/.test(value);
  const letters = value.replace(/\d/g, "");
  let score = 0;
  if (upper && lower && digits) score += 2;
  else if (digits && letters.length >= 2) score += 1;
  if (letters.length >= 4) {
    const vowels = (letters.match(/[aeiouy]/gi) ?? []).length;
    if (vowels / letters.length < 0.25) score += 1;
  }
  if (value.length >= 5 && caseTransitions(value) >= 3) score += 1;
  if (letters.length >= 5) {
    const upperRatio = (letters.match(/[A-Z]/g) ?? []).length / letters.length;
    if (upper && lower && upperRatio >= 0.4) score += 1;
  }
  return score;
}

export function looksGenerated(text: string): boolean {
  return generatedScore(text) >= 2;
}

function removedRunLooksGenerated(parts: readonly string[]): boolean {
  if (parts.length === 1) return looksGenerated(parts[0]!);
  if (!parts.every((part) => part.length < 4 || looksGenerated(part)))
    return false;
  return looksGenerated(parts.join(""));
}

/**
 * Collapses a generated class token to its stable component prefix:
 * `listItem__X41oTe` -> `listItem`, `prc-Token-IssueLabel-2IazM` ->
 * `prc-Token-IssueLabel`, `prc-Token-TokenBase-te5-F` ->
 * `prc-Token-TokenBase`. Returns null when the whole token is generated or no
 * semantic prefix remains.
 */
export function stableClassPrefix(token: string): string | null {
  const segments = segmentsOf(token);
  if (segments.length < 2) return null;
  for (let count = 1; count <= Math.min(3, segments.length - 1); count++) {
    const start = segments[segments.length - count]!.start;
    const removed = segments
      .slice(segments.length - count)
      .map((part) => part.text);
    const prefix = token.slice(0, start).replace(/[-_]+$/, "");
    if (prefix.length < 3) continue;
    if (isGenericPrefix(prefix)) continue;
    if (removedRunLooksGenerated(removed)) return prefix;
  }
  return null;
}

export function lastStableSegment(token: string): string | null {
  const segments = segmentsOf(token);
  for (let index = segments.length - 1; index >= 0; index--) {
    const text = segments[index]!.text;
    if (text.length >= 4 && !looksGenerated(text) && !isGenericPrefix(text))
      return text;
  }
  return null;
}

export function classPrefixes(token: string): string[] {
  const prefixes: string[] = [];
  const reduced = stableClassPrefix(token);
  if (reduced) prefixes.push(reduced);
  const last = lastStableSegment(token);
  if (last && last !== reduced) prefixes.push(last);
  return prefixes;
}

export function isGenericPrefix(prefix: string): boolean {
  return genericPrefixes.has(prefix.toLowerCase());
}

export function isStatePrefix(prefix: string): boolean {
  return (
    statePrefixes.has(prefix) ||
    /^(?:is|has|with)[-_]/.test(prefix) ||
    /[-_](?:selected|active|open|closed|disabled|checked|focused?|hovered|expanded|collapsed|loading|hidden|visible|current)$/.test(
      prefix,
    )
  );
}

export function prefixSet(element: Element): Set<string> {
  const prefixes = new Set<string>();
  for (const token of element.classList) {
    for (const prefix of classPrefixes(token)) {
      if (!isStatePrefix(prefix)) prefixes.add(prefix);
    }
  }
  return prefixes;
}
