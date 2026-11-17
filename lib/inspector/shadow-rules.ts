import type { Theme } from "../theme";
import { rulesForHost, type UserRule } from "./rules";
import { splitShadowSelector } from "./shadow-selector";

/**
 * User rules may target elements inside open shadow roots. CSS cannot pierce a
 * shadow boundary, so those rules name a host chain and the same stylesheet
 * text is injected into the matching shadow root instead of the document. That
 * keeps the rule from leaking into unrelated components.
 */

const STYLE_ATTRIBUTE = "data-duxreader-shadow-rule";

function validSelector(selector: string): string | null {
  try {
    document.createDocumentFragment().querySelector(selector);
    return selector;
  } catch {
    // A malformed selector must not break rule application for the whole page.
    return null;
  }
}

function rootFor(scope: ParentNode, hostSelector: string): ShadowRoot | null {
  const selector = validSelector(hostSelector);
  if (!selector) return null;
  const host = scope.querySelector(selector);
  return host?.shadowRoot ?? null;
}

// The stored selector carries a " >>> " host chain, which is a Duxreader
// storage format rather than valid CSS. The sheet is injected into the owning
// shadow root, so only the inner selector may reach CSS.emit.
function mapCSS(
  rule: Extract<UserRule, { kind: "map" }>,
  inner: string,
  colors: Theme["colors"],
) {
  const value = colors[rule.target];
  if (typeof value !== "string") return "";
  return `${inner}{${rule.property}:${value}!important;}`;
}

function cssFor(rule: UserRule, inner: string, colors: Theme["colors"]) {
  // Both branches must emit a selector the browser can parse; a rule that
  // keeps the host chain is silently discarded by the CSS parser.
  if (rule.kind === "map") return mapCSS(rule, inner, colors);
  return `${inner}{${rule.declarations}}`;
}

interface Injection {
  style: HTMLStyleElement;
  root: ShadowRoot;
}

/**
 * Applies every shadow-scoped rule for this site and returns a disposer. The
 * disposer also detaches the DOM observer, so a page can rebuild its shadow
 * styles on every palette change without leaking nodes.
 */
export function applyShadowRules(
  rules: readonly UserRule[],
  host: string,
  colors: Theme["colors"],
): () => void {
  const scoped = rulesForHost(rules, host).flatMap((rule) => {
    const split = splitShadowSelector(rule.selector);
    return split ? [{ rule, split }] : [];
  });
  if (scoped.length === 0) return () => {};

  const injections = new Map<string, Injection>();
  let observer: MutationObserver | null = null;
  let scheduled = false;

  const resolveRoot = (hosts: readonly string[]) => {
    let scope: ParentNode = document;
    let root: ShadowRoot | null = null;
    for (const hostSelector of hosts) {
      root = rootFor(scope, hostSelector);
      if (!root) return null;
      scope = root;
    }
    return root;
  };

  const sync = () => {
    const seen = new Set<string>();
    for (const { rule, split } of scoped) {
      const root = resolveRoot(split.hosts);
      if (!root) continue;
      const key = rule.selector;
      seen.add(key);
      const css = cssFor(rule, split.inner, colors);
      const existing = injections.get(key);
      if (existing) {
        if (existing.root !== root) {
          existing.root = root;
          root.append(existing.style);
        }
        if (existing.style.textContent !== css)
          existing.style.textContent = css;
        continue;
      }
      const style = document.createElement("style");
      style.className = "darkreader";
      style.setAttribute(STYLE_ATTRIBUTE, "");
      style.textContent = css;
      root.append(style);
      injections.set(key, { style, root });
    }
    for (const [key, injection] of injections) {
      if (seen.has(key)) continue;
      injection.style.remove();
      injections.delete(key);
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  };

  sync();
  // Shadow hosts and their content are often created after first paint, so
  // watch for additions instead of assuming the tree is complete.
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    observer?.disconnect();
    observer = null;
    for (const injection of injections.values()) injection.style.remove();
    injections.clear();
  };
}
