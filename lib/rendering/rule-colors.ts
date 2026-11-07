import names from "color-name";
import { luminance, neutral, parseColor, sameColor } from "../color-roles";
import type { VariableProjections } from "./variable-projections";

export type ColorRole = "bg" | "control" | "fg" | "link" | "edge" | "on-accent";
export const colorRoles: ColorRole[] = [
  "bg",
  "control",
  "fg",
  "link",
  "edge",
  "on-accent",
];
export const projectedVariable = (name: string, role: ColorRole) =>
  `--dux-value-${role}-${name.slice(2)}`;
export function variableRole(name: string, role: ColorRole): ColorRole {
  if (
    role === "fg" &&
    /on[-_]?(?:primary|accent|emphasis)|(?:primary|accent).*fg/i.test(name)
  )
    return "on-accent";
  if (role === "fg" && /link|accent/i.test(name)) return "link";
  if (role === "bg" && /primary|accent/i.test(name)) return "control";
  return role;
}

// CSSStyleDeclaration iteration expands shorthands into longhands. Those
// longhands have empty values for background:var(...), so read the serialized
// declaration names instead of silently dropping deferred substitutions.
export function declarationNames(css: string): string[] {
  const names: string[] = [];
  let start = 0,
    depth = 0,
    quote = "";
  for (let i = 0; i <= css.length; i++) {
    const c = css[i];
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
    if (!depth && (c === ";" || i === css.length)) {
      const part = css.slice(start, i),
        colon = part.indexOf(":");
      if (colon >= 0) names.push(part.slice(0, colon).trim());
      start = i + 1;
    }
  }
  return names;
}

export function colorContext(selector: string) {
  return {
    control:
      /\b(?:button|input|select|textarea|btn|control|primary|accent)\b|\[role\s*=\s*["']?(?:button|tab)/i.test(
        selector,
      ),
    link: /(?:^|[\s>+~,])a(?:[.#[:\s]|$)|\blink\b/i.test(selector),
    semantic: /danger|error|warning|success|destructive/i.test(selector),
  };
}

// Tokenize just enough to preserve CSS strings, URLs, escaped identifiers, and
// balanced functions. The browser remains the grammar/cascade evaluator. No DOM
// state or computed-style reads are needed when these values are consumed.
export function mapRuleValue(
  value: string,
  role: ColorRole,
  sourceBackground = "#ffffff",
  baseURL?: string,
  projection?: VariableProjections,
): string {
  const base = parseColor(sourceBackground);
  const palette = (token: string) => {
    const named = Object.hasOwn(names, token.toLowerCase())
      ? names[token.toLowerCase() as keyof typeof names]
      : undefined;
    const color = parseColor(named ? `rgb(${named.join(",")})` : token);
    if (!color || color.a <= 0.01) return token;
    let variable: string;
    if (role === "on-accent") variable = "--dux-on-accent";
    else if (role === "link") variable = "--dux-accent";
    else if (!neutral(color)) {
      if (role !== "control") return token;
      variable = "--dux-accent";
    } else if (role === "bg" || role === "control") {
      variable =
        (base && sameColor(base, color)) ||
        luminance(color) > 0.98 ||
        luminance(color) < 0.002
          ? "--dux-bg"
          : "--dux-surface";
    } else if (role === "edge") variable = "--dux-border";
    else variable = "--dux-fg";
    return color.a < 1
      ? `color-mix(in srgb,var(${variable}) ${color.a * 100}%,transparent)`
      : `var(${variable})`;
  };
  let output = "";
  for (let i = 0; i < value.length;) {
    const tail = value.slice(i),
      c = value[i]!;
    if (c === '"' || c === "'" || tail.startsWith("/*")) {
      let end = i + (tail.startsWith("/*") ? 2 : 1);
      if (tail.startsWith("/*"))
        end =
          value.indexOf("*/", end) < 0
            ? value.length
            : value.indexOf("*/", end) + 2;
      else {
        while (end < value.length) {
          if (value[end] === "\\") end += 2;
          else if (value[end++] === c) break;
        }
      }
      output += value.slice(i, end);
      i = end;
      continue;
    }
    const hex = /^#[\da-f]{3,8}\b/i.exec(tail);
    if (hex) {
      output += palette(hex[0]);
      i += hex[0].length;
      continue;
    }
    const identifier =
      /^(?:--|-)?(?:[a-z_\u0080-\uffff]|\\.)(?:[\w\u0080-\uffff-]|\\.)*/i.exec(
        tail,
      );
    if (!identifier) {
      output += c;
      i++;
      continue;
    }
    const word = identifier[0],
      start = i;
    i += word.length;
    if (value[i] !== "(") {
      output += palette(word);
      continue;
    }
    let end = i + 1,
      depth = 1,
      quote = "";
    for (; end < value.length && depth; end++) {
      const ch = value[end]!;
      if (ch === "\\") {
        end++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    const whole = value.slice(start, end),
      inner = value.slice(i + 1, end - 1);
    if (depth) output += whole;
    else if (word.toLowerCase() === "url") {
      try {
        output += baseURL
          ? `url(${JSON.stringify(new URL(inner.trim().replace(/^(["'])([\s\S]*)\1$/, "$2"), baseURL).href)})`
          : whole;
      } catch {
        output += whole;
      }
    } else if (word.toLowerCase() === "var") {
      const match =
        /^\s*(--(?:[\w\u0080-\uffff-]|\\.)+)\s*(?:,([\s\S]*))?$/.exec(inner);
      const projectedRole = match ? variableRole(match[1]!, role) : role;
      if (match && !match[1]!.startsWith("--dux-"))
        projection?.use(match[1]!, projectedRole);
      output +=
        !match || match[1]!.startsWith("--dux-")
          ? whole
          : `var(${projectedVariable(match[1]!, projectedRole)}${match[2] !== undefined ? `,${mapRuleValue(match[2], projectedRole, sourceBackground, baseURL, projection)}` : ""})`;
    } else if (parseColor(whole)) output += palette(whole);
    else
      output += `${word}(${mapRuleValue(inner, role, sourceBackground, baseURL, projection)})`;
    i = end;
  }
  return output;
}

export function compileDeclarations(
  style: CSSStyleDeclaration,
  selector: string,
  sourceBackground: string,
  inline = false,
  baseURL?: string,
  scope: "all" | "properties" | "variables" = "all",
  projection?: VariableProjections,
): string {
  const context = colorContext(selector);
  const rawBG =
    style.getPropertyValue("background-color") ||
    style.getPropertyValue("background");
  const mappedBG = mapRuleValue(
    rawBG,
    context.control && !context.semantic ? "control" : "bg",
    sourceBackground,
  );
  const onAccent = mappedBG.includes("var(--dux-accent)");
  const properties = declarationNames(style.cssText);
  if (projection)
    for (const name of properties)
      if (name.startsWith("--") && !name.startsWith("--dux-"))
        projection.define(name, style.getPropertyValue(name));
  const result: string[] = [];
  for (const property of properties) {
    const value = style.getPropertyValue(property),
      important = style.getPropertyPriority(property);
    if (property.startsWith("--")) {
      if (scope === "properties") continue;
      if (!property.startsWith("--dux-"))
        for (const role of projection ? projection.roles(property) : colorRoles)
          result.push(
            `${projectedVariable(property, role)}:${mapRuleValue(value, role, sourceBackground, baseURL, projection)}${important ? "!important" : ""};`,
          );
      continue;
    }
    if (scope === "variables") continue;
    let role: ColorRole | undefined;
    if (property.startsWith("background"))
      role = context.control && !context.semantic ? "control" : "bg";
    else if (property === "color" || property === "-webkit-text-fill-color")
      role = onAccent
        ? "on-accent"
        : context.link && !context.semantic
          ? "link"
          : "fg";
    else if (
      /color$|shadow$/.test(property) ||
      /^(?:border(?:-(?:top|bottom|left|right))?|outline|column-rule|fill|stroke)$/.test(
        property,
      )
    )
      role = property === "text-shadow" ? "fg" : "edge";
    if (!role) continue;
    const mapped = mapRuleValue(
      value,
      role,
      sourceBackground,
      baseURL,
      projection,
    );
    // Inline overrides have unique targets, so an unchanged value can use the
    // original declaration. Stylesheet identity rules still reset earlier rules.
    if (inline && mapped === value) continue;
    // Identity declarations must still be emitted: a later transparent,
    // inherit/currentColor, or semantic value can reset an earlier override.
    result.push(
      `${property}:${mapped}${important || inline ? "!important" : ""};`,
    );
  }
  return result.join("");
}
