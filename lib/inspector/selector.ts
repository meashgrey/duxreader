import {
  isGenericPrefix,
  isStatePrefix,
  lastStableSegment,
  looksGenerated,
  prefixSet,
  stableClassPrefix,
} from "./class-names";

const colorProperties = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "accent-color",
  "fill",
  "stroke",
  "box-shadow",
] as const;

const primitiveWords = new Set([
  "text",
  "base",
  "wrapper",
  "container",
  "root",
  "box",
  "stack",
  "flex",
  "grid",
  "layout",
  "icon",
  "token",
  "item",
  "content",
  "inner",
  "outer",
  "view",
  "group",
  "element",
  "component",
]);

const testIdAttributes = [
  "data-testid",
  "data-test-id",
  "data-test",
  "data-test-name",
  "data-qa",
  "data-cy",
] as const;

const dataAttributeWeights: Record<string, number> = {
  "data-component": 40,
  "data-slot": 38,
  "data-part": 34,
  "data-role": 32,
  "data-type": 28,
  "data-variant": 26,
  "data-section": 22,
  "data-layout": 20,
  "data-tone": 16,
  "data-product": 14,
};

const natureAttributes = [
  "data-slot",
  "data-component",
  "data-part",
  "data-role",
  "role",
] as const;

const escapeClass = (name: string) =>
  typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(name)
    : name.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

const escapeAttribute = (value: string) => value.replace(/["\\]/g, "\\$&");

function semanticQuality(prefix: string): number {
  const segment = lastStableSegment(prefix) ?? prefix;
  const words = segment
    .split(/(?=[A-Z])/)
    .map((word) => word.toLowerCase().replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return 0;
  return words.some((word) => !primitiveWords.has(word)) ? 1 : 0;
}

function natureOf(element: Element): string {
  return natureAttributes
    .map((name) => `${name}=${element.getAttribute(name) ?? ""}`)
    .join("|");
}

function similarity(
  candidate: Element,
  tag: string,
  prefixes: ReadonlySet<string>,
  nature: string,
): number {
  if (candidate.localName !== tag) return 0;
  if (natureOf(candidate) !== nature) return 0;
  const left = prefixSet(candidate);
  if (left.size === 0 && prefixes.size === 0) return 1;
  let shared = 0;
  for (const prefix of left) if (prefixes.has(prefix)) shared++;
  if (shared === 0) return 0;
  return shared / (left.size + prefixes.size - shared);
}

type CandidateKind = "attribute" | "class" | "id" | "semantic" | "scoped" | "exact";

interface Candidate {
  readonly selector: string;
  readonly kind: CandidateKind;
  /** Attribute values known to identify one component family. */
  readonly authoritative?: boolean;
  /** Higher when the prefix names the component rather than a base primitive. */
  readonly quality?: number;
  /** Semantic specificity; breaks ties between equally pure families. */
  readonly weight?: number;
}

function stableId(element: Element): string | null {
  const id = element.id;
  if (!id || id.length > 80) return null;
  if (/[:/.\s]/.test(id)) return null;
  if (/^(?:radix-|headlessui-|ember\d|react-|mui-|:r)/i.test(id)) return null;
  if (/^\d/.test(id)) return null;
  if (looksGenerated(id)) return null;
  return `#${escapeClass(id)}`;
}

function usableAttributeValue(value: string | null, max: number): string | null {
  if (!value || value.length > max) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\n"]/.test(trimmed) || looksGenerated(trimmed))
    return null;
  if (/\d{3,}/.test(trimmed)) return null;
  return trimmed;
}

function attributeCandidates(element: Element): Candidate[] {
  const candidates: Candidate[] = [];
  const tag = element.localName;
  for (const name of testIdAttributes) {
    const value = usableAttributeValue(element.getAttribute(name), 120);
    if (!value) continue;
    candidates.push({
      selector: `[${name}="${escapeAttribute(value)}"]`,
      kind: "attribute",
      authoritative: true,
    });
  }
  for (const [name, weight] of Object.entries(dataAttributeWeights)) {
    const value = usableAttributeValue(element.getAttribute(name), 120);
    if (!value) continue;
    // Generic component names ("Text", "Box", "TokenBase") are as weak as
    // typography classes, so a wrapper can still be climbed past.
    const quality = semanticQuality(value);
    candidates.push({
      selector: `[${name}="${escapeAttribute(value)}"]`,
      kind: "semantic",
      quality,
      weight,
    });
    candidates.push({
      selector: `${tag}[${name}="${escapeAttribute(value)}"]`,
      kind: "semantic",
      quality,
      weight: weight - 2,
    });
  }
  const role = element.getAttribute("role");
  if (role && /^[\w-]+$/.test(role))
    candidates.push({
      selector: `${tag}[role="${escapeAttribute(role)}"]`,
      kind: "semantic",
      quality: 1,
      weight: 18,
    });
  const label = element.getAttribute("aria-label");
  if (label) {
    const value = usableAttributeValue(label, 80);
    if (value)
      candidates.push({
        selector: `${tag}[aria-label="${escapeAttribute(value)}"]`,
        kind: "semantic",
        quality: 1,
        weight: 16,
      });
  }
  if (tag === "a" || tag === "area") {
    const href = element.getAttribute("href");
    if (
      href &&
      href.length <= 240 &&
      !/^[#]|^(?:javascript|mailto|tel|data):/i.test(href) &&
      !/[\n"]/.test(href)
    ) {
      candidates.push({
        selector: `${tag}[href="${escapeAttribute(href)}"]`,
        kind: "attribute",
        quality: 1,
        weight: 12,
      });
      const path = href.split(/[?#]/)[0]!;
      if (path.startsWith("/") && /^\/[\w./-]+$/.test(path)) {
        const segments = path.split("/").filter(Boolean);
        const prefix =
          segments.length > 1 ? `/${segments[0]}/` : `/${segments[0] ?? ""}`;
        if (prefix.length > 1)
          candidates.push({
            selector: `${tag}[href^="${escapeAttribute(prefix)}"]`,
            kind: "attribute",
            quality: 1,
            weight: 8,
          });
      }
    }
  }
  return candidates;
}

function classCandidates(element: Element): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const add = (prefix: string, reduced: boolean) => {
    if (prefix.length < 3 || isGenericPrefix(prefix)) return;
    if (seen.has(prefix)) return;
    seen.add(prefix);
    const quality = semanticQuality(prefix);
    if (!reduced) {
      candidates.push({
        selector: `.${escapeClass(prefix)}`,
        kind: "class",
        quality,
        weight: prefix.length,
      });
    }
    candidates.push({
      selector: `[class*="${escapeAttribute(prefix)}"]`,
      kind: "class",
      quality,
      weight: prefix.length,
    });
    candidates.push({
      selector: `${element.localName}[class*="${escapeAttribute(prefix)}"]`,
      kind: "class",
      quality,
      weight: prefix.length - 1,
    });
  };
  for (const token of element.classList) {
    if (isStatePrefix(token)) continue;
    const reduced = stableClassPrefix(token);
    if (reduced) add(reduced, true);
    else if (!looksGenerated(token)) add(token, false);
  }
  for (const token of element.classList) {
    if (isStatePrefix(token)) continue;
    const reduced = stableClassPrefix(token);
    const last = lastStableSegment(token);
    if (last && last !== reduced && !looksGenerated(token)) add(last, true);
  }
  return candidates;
}

function stableAnchor(element: Element): string | null {
  const doc = element.ownerDocument;
  const scope = scopeRootOf(element);
  let node = element.parentElement;
  let depth = 0;
  while (node && node !== doc.documentElement && depth++ < 8) {
    for (const name of [
      ...testIdAttributes,
      ...Object.keys(dataAttributeWeights),
    ]) {
      const value = node.getAttribute(name);
      if (!value || value.length > 120) continue;
      if (/[\n"]/.test(value) || looksGenerated(value)) continue;
      return `[${name}="${escapeAttribute(value)}"]`;
    }
    const id = stableId(node);
    if (id) return id;
    const tokens = [...node.classList];
    for (const token of tokens) {
      const reduced = stableClassPrefix(token);
      if (!reduced && looksGenerated(token)) continue;
      const prefix = reduced ?? token;
      if (prefix.length < 3 || isGenericPrefix(prefix))
        continue;
      if (isStatePrefix(token)) continue;
      const selector =
        token === prefix
          ? `.${escapeClass(prefix)}`
          : `[class*="${escapeAttribute(prefix)}"]`;
      if (scope.querySelectorAll(selector).length <= 12) return selector;
    }
    node = node.parentElement;
  }
  return null;
}

function scopedCandidates(element: Element): Candidate[] {
  const anchor = stableAnchor(element);
  if (!anchor) return [];
  const candidates: Candidate[] = [];
  candidates.push({
    selector: `${anchor} ${element.localName}`,
    kind: "scoped",
    quality: 0,
    weight: 10,
  });
  for (const candidate of classCandidates(element).slice(0, 4)) {
    candidates.push({
      selector: `${anchor} ${candidate.selector}`,
      kind: "scoped",
      quality: candidate.quality,
    });
  }
  return candidates;
}

function structuralCandidates(element: Element): Candidate[] {
  const doc = element.ownerDocument;
  const ancestors: Element[] = [];
  let node = element.parentElement;
  while (
    node &&
    node !== doc.documentElement &&
    node.localName !== "body" &&
    ancestors.length < 3
  ) {
    ancestors.unshift(node);
    node = node.parentElement;
  }
  const candidates: Candidate[] = [];
  const chain = [element.localName];
  for (const ancestor of ancestors.reverse()) {
    chain.unshift(ancestor.localName);
    const weight = 30 - chain.length * 2;
    candidates.push({
      selector: chain.join(" > "),
      kind: "scoped",
      quality: 0,
      weight,
    });
    candidates.push({
      selector: chain.join(" "),
      kind: "scoped",
      quality: 0,
      weight: weight - 1,
    });
  }
  return candidates;
}

function selectorCandidates(element: Element): Candidate[] {
  const candidates = [
    ...attributeCandidates(element),
    ...classCandidates(element),
    ...scopedCandidates(element),
    ...structuralCandidates(element),
  ];
  const id = stableId(element);
  if (id) candidates.push({ selector: id, kind: "id" });
  return candidates;
}

export interface FamilySelection {
  readonly selector: string;
  readonly exact: string;
  readonly kind: CandidateKind;
  /** 1 when the selector names a component, 0 for generated/base classes. */
  readonly quality: number;
  readonly matches: Element[];
}

/**
 * Finds the broadest selector that still describes the picked element's
 * component family. Falls back to a unique path only when nothing stable
 * matches.
 */
export function familySelector(element: Element): FamilySelection {
  const scope = scopeRootOf(element);
  const exact = selectorFor(element);
  const seen = new Set<string>();
  const families: Array<{
    candidate: Candidate;
    matches: Element[];
    similarity: number;
  }> = [];
  let single: Candidate | null = null;
  let singles: Element[] = [];
  const targetTag = element.localName;
  const targetPrefixes = prefixSet(element);
  const targetNature = natureOf(element);
  // Candidate selectors are resolved inside the element's own tree, so a
  // shadow match is re-qualified with its host chain before storage.
  const finish = (selection: FamilySelection): FamilySelection => ({
    ...selection,
    selector: withHostChain(element, selection.selector),
  });
  for (const candidate of selectorCandidates(element)) {
    if (seen.has(candidate.selector)) continue;
    seen.add(candidate.selector);
    let matches: Element[];
    try {
      matches = [...scope.querySelectorAll(candidate.selector)].filter(
        (node) => !node.closest("[data-duxreader-picker]"),
      );
    } catch {
      continue;
    }
    if (!matches.includes(element)) continue;
    if (matches.length > 5000) continue;
    if (candidate.kind === "attribute" && candidate.authoritative)
      return finish({
        selector: candidate.selector,
        exact,
        kind: candidate.kind,
        quality: 1,
        matches,
      });
    if (candidate.kind === "id")
      return finish({
        selector: candidate.selector,
        exact,
        kind: candidate.kind,
        quality: 1,
        matches,
      });
    const score = Math.min(
      ...matches.map((match) =>
        similarity(match, targetTag, targetPrefixes, targetNature),
      ),
    );
    if (score <= 0.5) continue;
    if (matches.length === 1) {
      if (!single) {
        single = candidate;
        singles = matches;
      }
      continue;
    }
    families.push({ candidate, matches, similarity: score });
  }
  if (families.length > 0) {
    families.sort((left, right) => {
      const leftQuality = left.candidate.quality ?? 0;
      const rightQuality = right.candidate.quality ?? 0;
      if (rightQuality !== leftQuality) return rightQuality - leftQuality;
      if (right.similarity !== left.similarity)
        return right.similarity - left.similarity;
      const leftWeight = left.candidate.weight ?? 0;
      const rightWeight = right.candidate.weight ?? 0;
      if (rightWeight !== leftWeight) return rightWeight - leftWeight;
      return right.matches.length - left.matches.length;
    });
    const best = families[0]!;
    return finish({
      selector: best.candidate.selector,
      exact,
      kind: best.candidate.kind,
      quality: best.candidate.quality ?? 0,
      matches: best.matches,
    });
  }
  if (single)
    return finish({
      selector: single.selector,
      exact,
      kind: single.kind,
      quality: single.quality ?? 0,
      matches: singles,
    });
  return {
    selector: exact,
    exact,
    kind: "exact",
    quality: 0,
    matches: [element],
  };
}

export interface PickerTarget {
  readonly element: Element;
  readonly selection: FamilySelection;
}

const interactiveSelector =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"]';

/**
 * A click often lands on a generic text or layout span. Prefer the nearest
 * ancestor that names a real component, so the rule targets the component
 * instead of a typography primitive shared by unrelated UI.
 */
export function resolvePickerTarget(element: Element): PickerTarget {
  let target = element;
  let selection = familySelector(element);
  if (selection.quality > 0) return { element: target, selection };
  let node = element.parentElement;
  let depth = 0;
  while (node && depth++ < 4) {
    const candidate = familySelector(node);
    if (candidate.quality > 0 && candidate.kind === "class") {
      target = node;
      selection = candidate;
      break;
    }
    if (node.matches(interactiveSelector)) {
      target = node;
      selection = candidate;
      break;
    }
    node = node.parentElement;
  }
  return { element: target, selection };
}

/** The tree root that scopes a selector: a shadow root, or the document. */
export function scopeRootOf(element: Element): ParentNode & {
  querySelectorAll(selectors: string): NodeListOf<Element>;
} {
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) return root;
  return element.ownerDocument;
}

/** True when a selector crosses a shadow boundary and needs its host prefix. */
export function shadowHostChain(element: Element): Element[] {
  const hosts: Element[] = [];
  let node: Element | null = element;
  while (node) {
    const root: Node = node.getRootNode();
    if (!(root instanceof ShadowRoot)) break;
    const host: Element = root.host;
    hosts.unshift(host);
    node = host;
  }
  return hosts;
}

/**
 * Prefixes a selector that was resolved inside a shadow root with the host
 * chain, so it can be stored and matched from the document again.
 */
export function withHostChain(element: Element, selector: string): string {
  const hosts = shadowHostChain(element);
  if (hosts.length === 0) return selector;
  const outer = hosts.map((host) => selectorWithinScope(host)).join(" >>> ");
  return `${outer} >>> ${selector}`;
}

export function selectorFor(element: Element): string {
  const doc = element.ownerDocument;
  if (element === doc.documentElement) return "html";
  if (element === doc.body) return "body";
  const hosts = shadowHostChain(element);
  if (hosts.length > 0) {
    const inner = selectorWithinScope(element);
    const outer = hosts
      .map((host) => selectorWithinScope(host))
      .join(" >>> ");
    return `${outer} >>> ${inner}`;
  }
  return selectorWithinScope(element);
}

function selectorWithinScope(element: Element): string {
  const doc = element.ownerDocument;
  const scope = scopeRootOf(element);
  if (element === doc.documentElement) return "html";
  if (element === doc.body) return "body";
  const id = stableId(element);
  if (id && scope.querySelectorAll(id).length === 1) return id;

  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== doc.documentElement) {
    let part = node.localName;
    const classes = [...node.classList]
      .filter((name) => name.length < 64 && !/[^\w-]/.test(name))
      .slice(0, 2);
    if (classes.length)
      part += `.${classes.map(escapeClass).join(".")}`;
    let parent: Element | null = node.parentElement;
    // Elements directly under a ShadowRoot have no parentElement, yet they can
    // still have same-tag siblings. Without a position qualifier every such
    // sibling would produce the same "exact" selector. Fall back to the root's
    // children when there is no parent element.
    const container: ParentNode & { children: HTMLCollection } =
      parent ?? (node.getRootNode() as ParentNode & { children: HTMLCollection });
    if (container.children) {
      const siblings = [...container.children].filter(
        (child) => child.localName === node!.localName,
      );
      if (siblings.length > 1)
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    if (scope.querySelectorAll(selector).length === 1) return selector;
    node = parent;
  }
  return parts.join(" > ");
}

export type ColorValues = Map<string, string>;

/** Identity colors decide whether two instances are "the same color". */
export const identityColorProperties: readonly string[] = [
  "color",
  "background-color",
  "background-image",
  "fill",
  "stroke",
];

export function captureColorValues(element: Element): ColorValues {
  // Elements inside shadow roots or other documents must be measured with the
  // window that owns them; the picker's global lookup only knows its own.
  const view = element.ownerDocument.defaultView ?? window;
  const style = view.getComputedStyle(element);
  const values: ColorValues = new Map();
  for (const property of colorProperties) {
    const value = style.getPropertyValue(property);
    if (!value || (property === "background-image" && value === "none"))
      continue;
    values.set(property, value);
  }
  return values;
}

export function declarationsFromValues(values: ReadonlyMap<string, string>) {
  let css = "";
  for (const [property, value] of values)
    css += `${property}:${value}!important;`;
  return css;
}

export function captureColorDeclarations(element: Element): string {
  return declarationsFromValues(captureColorValues(element));
}

export interface FamilyDeclarations {
  /** Properties that are identical across every sampled instance. */
  readonly stable: string;
  /** Repeating properties that differ between instances. */
  readonly varying: readonly string[];
  /** Distinct identity-color combinations across the sampled instances. */
  readonly identityVariants: number;
  /** Declarations for the picked element itself. */
  readonly own: string;
}

/**
 * Splits a color snapshot into the part that describes the whole component
 * family and the part that only belongs to one instance. Structural tints such
 * as a divider border on the first row vary per row; they must not be frozen
 * onto every sibling.
 */
export function describeColorFamily(
  element: Element,
  matches: readonly Element[],
): FamilyDeclarations {
  const ownValues = captureColorValues(element);
  const sampled = matches.length > 0 ? matches : [element];
  const samples = sampled.map((match) => captureColorValues(match));
  const variants = new Set<string>();
  for (const values of samples) {
    variants.add(
      identityColorProperties
        .map((property) => values.get(property) ?? "")
        .join("|"),
    );
  }
  const stable: ColorValues = new Map();
  const differing = new Set<string>();
  for (const [property, value] of ownValues) {
    let shared = true;
    for (const values of samples) {
      if (values.get(property) !== value) {
        shared = false;
        break;
      }
    }
    if (shared) stable.set(property, value);
    else differing.add(property);
  }
  // Borders move as a unit: pinning three sides of a divider while the fourth
  // stays themed looks broken, so drop them all when any side differs.
  const borderColors = [...ownValues.keys()].filter((property) =>
    /^border-(?:top|right|bottom|left)-color$/.test(property),
  );
  if (borderColors.some((property) => differing.has(property))) {
    for (const property of borderColors) {
      stable.delete(property);
      differing.add(property);
    }
  }
  const varying = [
    ...(borderColors.some((property) => differing.has(property))
      ? ["border colors"]
      : []),
    ...[...differing].filter(
      (property) => !/^border-(?:top|right|bottom|left)-color$/.test(property),
    ),
  ];
  return {
    stable: declarationsFromValues(stable),
    varying,
    identityVariants: variants.size,
    own: declarationsFromValues(ownValues),
  };
}
