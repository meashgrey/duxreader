import type { ColorMap } from "../../scripts/engine/color-map.mts";
import { normalizeSite } from "../site-exclusions";
import { splitShadowSelector } from "./shadow-selector";

export const USER_RULES_KEY = "userSiteRules";

export type UserRuleTarget = "background" | "surface" | "foreground" | "accent";
export type UserRuleProperty =
  | "background-color"
  | "color"
  | "border-color"
  | "fill"
  | "stroke";

export interface UserMapRule {
  kind: "map";
  host: string;
  selector: string;
  property: UserRuleProperty;
  target: UserRuleTarget;
  createdAt: number;
}

export interface UserPreserveRule {
  kind: "preserve";
  host: string;
  selector: string;
  declarations: string;
  createdAt: number;
}

export type UserRule = UserMapRule | UserPreserveRule;

export interface UserEngineRules {
  colorMaps: readonly ColorMap[];
  preserveInline: readonly string[];
  css: string;
  /** Rules whose selector crosses a shadow boundary. */
  shadowRules?: readonly UserRule[];
}

const targets = new Set<UserRuleTarget>([
  "background",
  "surface",
  "foreground",
  "accent",
]);
const properties = new Set<UserRuleProperty>([
  "background-color",
  "color",
  "border-color",
  "fill",
  "stroke",
]);

function validString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function selectorIsSafe(value: string): boolean {
  return !/[{}]/.test(value) && !value.includes("\0");
}

export function readUserRules(value: unknown): UserRule[] {
  if (!Array.isArray(value)) return [];
  const rules: UserRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<UserRule> & {
      host?: unknown;
      selector?: unknown;
      property?: unknown;
      target?: unknown;
      declarations?: unknown;
      kind?: unknown;
      createdAt?: unknown;
    };
    if (
      !validString(candidate.host, 255) ||
      !validString(candidate.selector, 4096) ||
      !selectorIsSafe(candidate.selector) ||
      typeof candidate.createdAt !== "number" ||
      !Number.isFinite(candidate.createdAt)
    )
      continue;
    const host = normalizeSite(candidate.host);
    if (candidate.kind === "map") {
      if (
        !properties.has(candidate.property as UserRuleProperty) ||
        !targets.has(candidate.target as UserRuleTarget)
      )
        continue;
      rules.push({
        kind: "map",
        host,
        selector: candidate.selector,
        property: candidate.property as UserRuleProperty,
        target: candidate.target as UserRuleTarget,
        createdAt: candidate.createdAt,
      });
    } else if (candidate.kind === "preserve") {
      if (!validString(candidate.declarations, 16384)) continue;
      rules.push({
        kind: "preserve",
        host,
        selector: candidate.selector,
        declarations: candidate.declarations,
        createdAt: candidate.createdAt,
      });
    }
  }
  const unique = new Map<string, UserRule>();
  for (const rule of rules) unique.set(userRuleKey(rule), rule);
  return [...unique.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function rulesForHost(rules: readonly UserRule[], host: string) {
  const normalized = normalizeSite(host);
  return rules.filter((rule) => rule.host === normalized);
}

export function userRuleKey(rule: UserRule): string {
  return rule.kind === "map"
    ? `${rule.host}|map|${rule.selector}|${rule.property}`
    : `${rule.host}|preserve|${rule.selector}`;
}

export function addUserRule(rules: readonly UserRule[], rule: UserRule): UserRule[] {
  const key = userRuleKey(rule);
  return [...rules.filter((current) => userRuleKey(current) !== key), rule];
}

export function removeUserRule(
  rules: readonly UserRule[],
  target: UserRule,
): UserRule[] {
  const key = userRuleKey(target);
  return rules.filter((rule) => userRuleKey(rule) !== key);
}

/**
 * Replaces a stored rule with an edited copy, keeping its position. If the edit
 * collides with another stored rule, the edited copy wins and the duplicate is
 * dropped so the same selector is never applied twice.
 */
export function replaceUserRule(
  rules: readonly UserRule[],
  original: UserRule,
  updated: UserRule,
): UserRule[] {
  const originalKey = userRuleKey(original);
  const updatedKey = userRuleKey(updated);
  const next: UserRule[] = [];
  for (const rule of rules) {
    const key = userRuleKey(rule);
    if (key === originalKey) {
      next.push(updated);
      continue;
    }
    if (key === updatedKey) continue;
    next.push(rule);
  }
  return next;
}

export function toEngineRules(
  rules: readonly UserRule[],
  host: string,
): UserEngineRules {
  const local = rulesForHost(rules, host);
  // Shadow-scoped rules cannot be expressed as document CSS or as a normal
  // color map; applyShadowRules injects them into the owning shadow root.
  const scoped = local.filter((rule) => splitShadowSelector(rule.selector));
  const light = local.filter((rule) => !splitShadowSelector(rule.selector));
  return {
    colorMaps: light
      .filter((rule): rule is UserMapRule => rule.kind === "map")
      .map((rule) => ({
        selector: rule.selector,
        property: rule.property,
        target: rule.target,
      })),
    preserveInline: light
      .filter((rule): rule is UserPreserveRule => rule.kind === "preserve")
      .map((rule) => rule.selector),
    css: light
      .filter((rule): rule is UserPreserveRule => rule.kind === "preserve")
      .map((rule) => `${rule.selector}{${rule.declarations}}`)
      .join("\n"),
    ...(scoped.length > 0 ? { shadowRules: scoped } : {}),
  };
}
