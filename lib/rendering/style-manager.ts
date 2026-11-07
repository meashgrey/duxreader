import type { Theme } from "../theme";
import { onAccent } from "../color-roles";
import { stylesheetImports, type ImportReference } from "./css-imports";
import {
  compileDeclarations,
  mapRuleValue,
  projectedVariable,
} from "./rule-colors";
import { splitSelectors } from "./css-analysis";
import { VariableProjections } from "./variable-projections";

export type StyleRoot = Document | ShadowRoot;
export const PRESERVED =
  'svg,svg *,img,picture,canvas,video,audio,iframe,[role="img"],[role="img"] *,[data-duxreader-preserve],[data-duxreader-preserve] *';

// The guard has zero specificity. State selectors, nesting, layers, scopes and
// conditional rules retain their native cascade rather than becoming DOM tags.
export function guardSelector(selector: string): string {
  let depth = 0,
    quote = "";
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (!depth && selector.slice(i, i + 2) === "::")
      return `${selector.slice(0, i)}:where(:not(${PRESERVED}))${selector.slice(i)}`;
  }
  return `${selector}:where(:not(${PRESERVED}))`;
}

export function createStyleManager(
  doc: Document,
  options: {
    background: string;
    readCSS?: (url: string) => Promise<string>;
    ready: () => void;
  },
) {
  const projection = new VariableProjections(options.ready);
  let epoch = 0,
    revision = 0,
    bytes = 0,
    themeRevision = 0;
  let sourceRevision = 0,
    auditClock = 0;
  const sourceVersions = new WeakMap<CSSStyleSheet, number>();
  const pendingAudits = new WeakSet<CSSStyleSheet>();
  let previousTheme: Theme | undefined;
  const cache = new WeakMap<
    CSSStyleSheet,
    {
      key: string;
      fastKey: string;
      auditedAt: number;
      css: string;
      missing: string[];
    }
  >();
  type Remote = {
    sheet?: CSSStyleSheet;
    imports: ImportReference[];
    attempted: number;
    failed?: boolean;
    bytes?: number;
  };
  const remote = new Map<string, Remote>();
  const owned = new WeakSet<CSSStyleSheet>();
  function load(url: string) {
    if (!/^https?:/.test(url) || !options.readCSS) return;
    let entry = remote.get(url);
    if (entry?.failed && Date.now() - entry.attempted > 60_000) {
      remote.delete(url);
      entry = undefined;
    }
    if (!entry && remote.size < 32) {
      const current = epoch;
      const target: Remote = { imports: [], attempted: Date.now() };
      remote.set(url, target);
      void Promise.resolve()
        .then(() => options.readCSS!(url))
        .then((text) => {
          if (epoch !== current || remote.get(url) !== target) return;
          const size = new TextEncoder().encode(text).length;
          if (size > 2 * 1024 ** 2 || bytes + size > 8 * 1024 ** 2)
            throw new Error("Stylesheet budget exceeded");
          const parsed = stylesheetImports(text, url);
          const sheet = new CSSStyleSheet();
          owned.add(sheet);
          sheet.replaceSync(parsed.css);
          target.sheet = sheet;
          target.imports = parsed.imports;
          target.bytes = size;
          bytes += size;
          revision++;
          options.ready();
        })
        .catch(() => {
          if (epoch === current && remote.get(url) === target) {
            target.failed = true;
            revision++;
            options.ready();
          }
        });
      entry = target;
    }
    return entry;
  }
  function wrapImport(css: string, ref: ImportReference) {
    if (!css) return "";
    if (ref.media) css = `@media ${ref.media}{${css}}`;
    if (ref.supports) css = `@supports (${ref.supports}){${css}}`;
    if (ref.layer !== undefined)
      css = `@layer${ref.layer ? ` ${ref.layer}` : ""}{${css}}`;
    return css;
  }
  function compile(sheet: CSSStyleSheet, theme: Theme, audit = false) {
    if (theme !== previousTheme) {
      previousTheme = theme;
      themeRevision++;
    }
    let length = -1;
    try {
      length = sheet.cssRules.length;
    } catch {
      /* Remote revision covers opaque sources. */
    }
    const fastKey = `${revision}:${themeRevision}:${projection.revision}:${sourceRevision}:${sourceVersions.get(sheet) ?? 0}:${sheet.disabled}:${sheet.media.mediaText}:${length}`;
    const previous = cache.get(sheet);
    if (previous?.fastKey === fastKey && !audit && !pendingAudits.has(sheet))
      return previous;
    pendingAudits.delete(sheet);
    function fingerprint(
      source: CSSStyleSheet,
      visited = new Set<CSSStyleSheet>(),
      depth = 0,
    ): string {
      if (visited.has(source) || depth > 4) return "";
      visited.add(source);
      const prefix = `${source.disabled}:${source.media.mediaText}:`;
      try {
        return (
          prefix +
          [...source.cssRules]
            .map(
              (rule) =>
                rule.cssText +
                (rule instanceof CSSImportRule && rule.styleSheet
                  ? fingerprint(rule.styleSheet, visited, depth + 1)
                  : ""),
            )
            .join("\n")
        );
      } catch {
        return prefix + source.href;
      }
    }
    const key = `${revision}:${themeRevision}:${projection.revision}:${fingerprint(sheet)}`;
    if (previous?.key === key) {
      previous.fastKey = fastKey;
      previous.auditedAt = ++auditClock;
      return previous;
    }
    const missing = new Set<string>();
    const visited = new Set<CSSStyleSheet | string>();
    function external(url: string, depth: number): string {
      if (depth > 4 || visited.has(url)) return "";
      visited.add(url);
      try {
        const entry = load(url);
        if (!entry?.sheet) {
          missing.add(url);
          return "";
        }
        return (
          entry.imports
            .map((ref) => wrapImport(external(ref.url, depth + 1), ref))
            .join("") + rules(entry.sheet.cssRules, url, depth)
        );
      } finally {
        visited.delete(url);
      }
    }
    function source(sourceSheet: CSSStyleSheet, depth: number): string {
      if (visited.has(sourceSheet) || depth > 4 || sourceSheet.disabled)
        return "";
      visited.add(sourceSheet);
      try {
        let entries: CSSRuleList;
        try {
          entries = sourceSheet.cssRules;
        } catch {
          return sourceSheet.href ? external(sourceSheet.href, depth) : "";
        }
        return rules(entries, sourceSheet.href ?? doc.baseURI, depth);
      } finally {
        visited.delete(sourceSheet);
      }
    }
    function rules(
      entries: CSSRuleList,
      base: string,
      depth: number,
      parentSelector = "",
    ): string {
      let css = "";
      for (const rule of entries) {
        if (rule instanceof CSSImportRule) {
          const ref = stylesheetImports(rule.cssText, base).imports[0];
          if (ref)
            css += wrapImport(
              rule.styleSheet
                ? source(rule.styleSheet, depth + 1)
                : external(ref.url, depth + 1),
              ref,
            );
        } else if (rule instanceof CSSStyleRule) {
          const context = rule.selectorText.includes("&")
            ? `${parentSelector} ${rule.selectorText}`
            : rule.selectorText;
          const declarations = compileDeclarations(
            rule.style,
            context,
            options.background,
            false,
            base,
            "all",
            projection,
          );
          const children =
            "cssRules" in rule
              ? rules(rule.cssRules, base, depth, context)
              : "";
          if (declarations || children)
            css += `${splitSelectors(rule.selectorText)
              .map((s) => guardSelector(s.trim()))
              .join(",")}{${declarations}${children}}`;
        } else if (rule instanceof CSSKeyframesRule) {
          // A same-name keyframes override replaces the entire definition, so
          // preserve geometry/opacity declarations along with mapped colors.
          css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${[
            ...rule.cssRules,
          ]
            .map((item) => {
              const frame = item as CSSKeyframeRule;
              const copy = doc.createElement("span").style;
              copy.cssText = frame.style.cssText;
              const mapped = compileDeclarations(
                frame.style,
                "",
                options.background,
                false,
                base,
                "all",
                projection,
              );
              return `${frame.keyText}{${copy.cssText}${mapped}}`;
            })
            .join("")}}`;
        } else if (/^@property\s/.test(rule.cssText)) {
          const name = /^@property\s+(--[^\s{]+)/.exec(rule.cssText)?.[1];
          const inherits = /inherits\s*:\s*false/i.test(rule.cssText)
            ? "false"
            : "true";
          const initial = /initial-value\s*:\s*([^;}]+)/.exec(
            rule.cssText,
          )?.[1];
          if (name && initial)
            for (const role of projection.roles(name)) {
              let mapped = mapRuleValue(initial, role, options.background);
              const vars: Record<string, string> = {
                bg: theme.colors.background,
                surface: theme.colors.surface,
                fg: theme.colors.foreground,
                accent: theme.colors.accent,
                border:
                  theme.material?.["outline-variant"] ?? theme.colors.surface,
                "on-accent":
                  theme.material?.["on-primary"] ??
                  onAccent(
                    theme.colors.background,
                    theme.colors.foreground,
                    theme.colors.accent,
                  ),
              };
              mapped = mapped.replace(
                /var\(--dux-([\w-]+)\)/g,
                (_, key: string) => vars[key] ?? "transparent",
              );
              css += `@property ${projectedVariable(name, role)}{syntax:"*";inherits:${inherits};initial-value:${mapped};}`;
            }
        } else if ("cssRules" in rule) {
          const body = rules(
            (rule as CSSGroupingRule).cssRules,
            base,
            depth,
            parentSelector,
          );
          if (body)
            css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${body}}`;
        } else if ("style" in rule && !rule.cssText.startsWith("@")) {
          css += compileDeclarations(
            (rule as unknown as { style: CSSStyleDeclaration }).style,
            parentSelector || "&",
            options.background,
            false,
            base,
            "all",
            projection,
          );
        } else if (/^@layer\s[^{}]+;/.test(rule.cssText)) css += rule.cssText;
      }
      return css;
    }
    const css = sheet.disabled ? "" : source(sheet, 0);
    const result = {
      key,
      fastKey,
      auditedAt: ++auditClock,
      css,
      missing: [...missing],
    };
    cache.set(sheet, result);
    return result;
  }
  return {
    compile,
    projection,
    invalidateSource(sheet?: CSSStyleSheet | null) {
      if (sheet)
        sourceVersions.set(sheet, (sourceVersions.get(sheet) ?? 0) + 1);
      else sourceRevision++;
    },
    auditNext(sheets: CSSStyleSheet[]) {
      let oldest: CSSStyleSheet | undefined,
        at = Infinity;
      for (const sheet of sheets) {
        const checked = cache.get(sheet)?.auditedAt ?? 0;
        if (checked < at) {
          oldest = sheet;
          at = checked;
        }
      }
      if (oldest) pendingAudits.add(oldest);
    },
    own(sheet: CSSStyleSheet) {
      owned.add(sheet);
    },
    isOwned(sheet: CSSStyleSheet) {
      return owned.has(sheet);
    },
    invalidate(url: string) {
      const entry = remote.get(url);
      if (remote.delete(url)) {
        bytes -= entry?.bytes ?? 0;
        revision++;
      }
    },
    dispose() {
      epoch++;
      remote.clear();
      projection.clear();
      bytes = 0;
    },
  };
}
