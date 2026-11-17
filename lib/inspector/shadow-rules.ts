import type { Theme } from "../theme";
import { rulesForHost, type UserRule } from "./rules";
import { SHADOW_SEPARATOR, splitShadowSelector } from "./shadow-selector";

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
function mapDeclaration(
  rule: Extract<UserRule, { kind: "map" }>,
  colors: Theme["colors"],
): string {
  const value = colors[rule.target];
  if (typeof value !== "string") return "";
  return `${rule.property}:${value}!important;`;
}

/**
 * Several stored rules may share one selector: two mappings on different
 * properties, or a mapping plus a preserved snapshot. They form one CSS rule,
 * so their declarations are concatenated instead of overwriting each other.
 * Preserve rules go last so a captured colour wins over a role mapping, which
 * matches the order the document engine uses.
 */
export function declarationsFor(
  rules: readonly UserRule[],
  colors: Theme["colors"],
): string {
  const mapped = rules
    .filter((rule): rule is Extract<UserRule, { kind: "map" }> => rule.kind === "map")
    .map((rule) => mapDeclaration(rule, colors))
    .join("");
  const preserved = rules
    .filter((rule): rule is Extract<UserRule, { kind: "preserve" }> => rule.kind === "preserve")
    .map((rule) => rule.declarations)
    .join("");
  return `${mapped}${preserved}`;
}

export interface ShadowRuleCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

// One reusable sheet keeps the check cheap: it only parses a short rule.
let scratchSheet: CSSStyleSheet | null | undefined;

function scratch(): CSSStyleSheet | null {
  if (scratchSheet !== undefined) return scratchSheet;
  try {
    scratchSheet = new CSSStyleSheet();
  } catch {
    // Engines without constructable stylesheets still get the separator checks.
    scratchSheet = null;
  }
  return scratchSheet;
}

/**
 * Guards the boundary between the stored rule model and real CSS. Shadow rules
 * are stored with a host chain, so it is easy to emit the storage separator or
 * a declaration the parser silently drops. An invalid rule is refused instead
 * of injected, and the reason is reported so a regression is loud rather than a
 * colour that quietly stops updating.
 */
export function checkShadowRuleCSS(
  css: string,
  inner: string,
): ShadowRuleCheck {
  if (!inner.trim()) return { ok: false, reason: "empty inner selector" };
  if (inner.includes(SHADOW_SEPARATOR))
    return {
      ok: false,
      reason: "the inner selector still contains the host-chain separator",
    };
  if (css.includes(SHADOW_SEPARATOR))
    return {
      ok: false,
      reason: "the emitted CSS contains the host-chain separator",
    };
  // A declaration block must be present; an empty one is a bug, not a no-op.
  if (!/\{[^{}]+\}/.test(css))
    return { ok: false, reason: "the emitted CSS has no declarations" };

  const sheet = scratch();
  if (!sheet) return { ok: true };
  try {
    sheet.replaceSync(css);
  } catch (error) {
    return { ok: false, reason: `the CSS parser rejected the rule: ${error}` };
  }
  const parsed = sheet.cssRules.length;
  if (parsed !== 1)
    return {
      ok: false,
      reason: `expected exactly one parsed rule, got ${parsed}`,
    };
  return { ok: true };
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
    // Group by the full rule identity before emitting: a selector alone is not
    // unique, and one <style> per selector would drop every rule but the last.
    const groups = new Map<
      string,
      { inner: string; root: ShadowRoot; rules: UserRule[] }
    >();
    for (const { rule, split } of scoped) {
      const root = resolveRoot(split.hosts);
      if (!root) continue;
      const key = `${rule.selector}\u0000${split.hosts.join(">>>")}`;
      const group = groups.get(key);
      if (group) {
        group.rules.push(rule);
        continue;
      }
      groups.set(key, { inner: split.inner, root, rules: [rule] });
    }

    const seen = new Set<string>();
    for (const [key, group] of groups) {
      seen.add(key);
      const css = `${group.inner}{${declarationsFor(group.rules, colors)}}`;
      const check = checkShadowRuleCSS(css, group.inner);
      if (!check.ok) {
        // Refuse rather than inject: the parser would discard it silently and
        // the user would only see a colour that cannot be changed.
        console.error(
          `Duxreader: skipped an invalid shadow rule for ${JSON.stringify(group.inner)}: ${check.reason}`,
        );
        continue;
      }
      const existing = injections.get(key);
      if (existing) {
        if (existing.root !== group.root) {
          existing.root = group.root;
          group.root.append(existing.style);
        }
        if (existing.style.textContent !== css)
          existing.style.textContent = css;
        continue;
      }
      const style = document.createElement("style");
      style.className = "darkreader";
      style.setAttribute(STYLE_ATTRIBUTE, "");
      style.textContent = css;
      group.root.append(style);
      injections.set(key, { style, root: group.root });
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
