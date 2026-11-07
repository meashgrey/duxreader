export type ColorUsage = "background" | "foreground" | "border" | "image";
export type Pseudo =
  "before" | "after" | "placeholder" | "marker" | "selection";
export interface Declaration {
  property: string;
  value: string;
}
export interface AnalyzedRule {
  selector: string;
  declarations: Declaration[];
}

// Commas inside :is(), attribute values, comments, and escaped identifiers are
// not selector separators. Keep the browser's selector grammar intact.
export function splitSelectors(value: string): string[] {
  const result: string[] = [];
  let start = 0,
    depth = 0,
    quote = "",
    comment = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (comment) {
      if (c === "*" && value[i + 1] === "/") {
        comment = false;
        i++;
      }
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && value[i + 1] === "*") {
      comment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      result.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

export function variablesIn(value: string): Set<string> {
  const result = new Set<string>();
  // Strings, comments, and URL payloads cannot create CSS variable references.
  const tokens = value.replace(
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)/gi,
    "",
  );
  for (const match of tokens.matchAll(/\bvar\(\s*(--[\w\u0080-\uffff-]+)/g))
    result.add(match[1]!);
  return result;
}
export function colorUsage(property: string): ColorUsage | undefined {
  if (property === "background-image" || property.includes("shadow"))
    return "image";
  if (property.startsWith("background")) return "background";
  if (
    /^(?:color|fill|stroke|text-decoration-color|caret-color|accent-color)$/.test(
      property,
    )
  )
    return "foreground";
  if (/^(?:border|outline|column-rule)/.test(property)) return "border";
  return undefined;
}
export function pseudoHost(selector: string): {
  host: string;
  pseudo?: Pseudo;
} {
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
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (depth || c !== ":") continue;
    const match = /^::?(before|after|placeholder|marker|selection)\b/.exec(
      selector.slice(i),
    );
    if (!match) continue;
    const raw = selector.slice(0, i),
      host = raw.trim();
    return {
      host: !host
        ? "*"
        : /\s$/.test(raw) || /[>+~]$/.test(host)
          ? `${host} *`
          : host,
      pseudo: match[1] as Pseudo,
    };
  }
  return { host: selector };
}
export function isStateSelector(selector: string): boolean {
  return (
    selector.includes(":\\") ||
    /[+~]|:(?:empty|dir|nth-(?:last-)?(?:child|of-type)|(?:first|last|only)-(?:child|of-type)|hover|active|focus(?:-within|-visible)?|checked|indeterminate|disabled|enabled|target|open|valid|invalid|user-valid|user-invalid|in-range|out-of-range|autofill|placeholder-shown|has)\b/.test(
      selector,
    )
  );
}

// Keystrokes do not change every CSS state. Filter the selector index before
// querying the document, while retaining nested :has/:is dependencies and
// conservatively handling escaped pseudo names that this lexical check misses.
export function interactionSelector(selector: string, event: string): boolean {
  if (selector.includes(":\\")) return true;
  if (event === "keydown" || event === "keyup")
    return /:(?:active|focus(?:-visible|-within)?)\b/.test(selector);
  if (event === "input" || event === "change")
    return /:(?:(?:user-)?(?:valid|invalid)|in-range|out-of-range|placeholder-shown|checked|indeterminate|dir|autofill)\b/.test(
      selector,
    );
  return true;
}

// A source can be replaced or removed without leaving stale dependencies. A
// shared variable may feed several roles; aliases and cycles retain that fact.
export class VariableGraph {
  private sources = new Map<object, AnalyzedRule[]>();
  private dependencies = new Map<string, Set<string>>();
  private uses = new Map<string, Set<ColorUsage>>();
  private consumers = new Map<string, Set<string>>();
  replace(source: object, rules?: AnalyzedRule[]) {
    if (rules) this.sources.set(source, rules);
    else this.sources.delete(source);
  }
  rebuild() {
    this.dependencies.clear();
    this.uses.clear();
    this.consumers.clear();
    for (const rules of this.sources.values())
      for (const rule of rules)
        for (const declaration of rule.declarations) {
          const refs = variablesIn(declaration.value);
          if (declaration.property.startsWith("--")) {
            let deps = this.dependencies.get(declaration.property);
            if (!deps)
              this.dependencies.set(declaration.property, (deps = new Set()));
            for (const ref of refs) deps.add(ref);
          } else {
            const usage = colorUsage(declaration.property);
            if (!usage) continue;
            for (const ref of refs) {
              let roles = this.uses.get(ref);
              if (!roles) this.uses.set(ref, (roles = new Set()));
              roles.add(usage);
              let selectors = this.consumers.get(ref);
              if (!selectors) this.consumers.set(ref, (selectors = new Set()));
              selectors.add(rule.selector);
            }
          }
        }
    const queue = new Set([...this.uses.keys(), ...this.consumers.keys()]);
    while (queue.size) {
      const name = queue.values().next().value!;
      queue.delete(name);
      for (const dep of this.dependencies.get(name) ?? []) {
        let changed = false;
        for (const [map, values] of [
          [this.uses, this.uses.get(name)],
          [this.consumers, this.consumers.get(name)],
        ] as const) {
          if (!values?.size) continue;
          let target = map.get(dep) as Set<string> | undefined;
          if (!target)
            (map as Map<string, Set<string>>).set(dep, (target = new Set()));
          for (const value of values)
            if (!target.has(value)) {
              target.add(value);
              changed = true;
            }
        }
        if (changed) queue.add(dep);
      }
    }
  }
  roles(name: string): ReadonlySet<ColorUsage> {
    return this.uses.get(name) ?? new Set();
  }
  selectors(names: Iterable<string>): Set<string> {
    const selectors = new Set<string>();
    for (const name of names)
      for (const selector of this.consumers.get(name) ?? [])
        selectors.add(selector);
    return selectors;
  }
  clear() {
    this.sources.clear();
    this.dependencies.clear();
    this.uses.clear();
    this.consumers.clear();
  }
}

// Palette sampling can create/reverse CSS color transitions. Their completion
// must not schedule another sample, or an idle page can enter a feedback loop.
// Layout/opacity transitions remain observable for genuine geometry changes.
export function isPaletteTransition(property: string): boolean {
  return (
    property.startsWith("--dux-") ||
    /(?:^|-)color$|(?:^|-)shadow$/.test(property) ||
    /^(?:fill|stroke|background|background-image|color-scheme)$/.test(property)
  );
}
