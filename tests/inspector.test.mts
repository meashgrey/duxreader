import { expect, test } from "bun:test";
import {
  addUserRule,
  readUserRules,
  removeUserRule,
  replaceUserRule,
  rulesForHost,
  toEngineRules,
  userRuleKey,
} from "../lib/inspector/rules.ts";

const mapRule = {
  kind: "map" as const,
  host: "www.example.com",
  selector: ".panel",
  property: "background-color" as const,
  target: "surface" as const,
  createdAt: 1,
};
const preserveRule = {
  kind: "preserve" as const,
  host: "example.com",
  selector: ".badge",
  declarations: "color:rgb(1, 2, 3)!important;",
  createdAt: 2,
};

test("inspector rules are normalized and deduplicated", () => {
  const rules = readUserRules([
    mapRule,
    mapRule,
    preserveRule,
    { ...mapRule, property: "width" },
    { ...mapRule, target: "red" },
    { ...preserveRule, selector: ".badge {}" },
  ]);
  expect(rules).toHaveLength(2);
  expect(rules[0]?.host).toBe("example.com");
  expect(readUserRules("not rules")).toEqual([]);
  expect(rulesForHost(rules, "www.example.com")).toHaveLength(2);
});

test("inspector rules compile into engine color maps and preserve CSS", () => {
  const rules = readUserRules([mapRule, preserveRule]);
  expect(toEngineRules(rules, "example.com")).toEqual({
    colorMaps: [
      {
        selector: ".panel",
        property: "background-color",
        target: "surface",
      },
    ],
    preserveInline: [".badge"],
    css: ".badge{color:rgb(1, 2, 3)!important;}",
  });
});

test("inspector rules can be replaced and removed by identity", () => {
  const first = readUserRules([mapRule]);
  const replacement = {
    ...mapRule,
    host: "example.com",
    target: "accent" as const,
    createdAt: 3,
  };
  expect(userRuleKey(first[0]!)).toBe(userRuleKey(replacement));
  expect(addUserRule(first, replacement)).toEqual([replacement]);
  expect(removeUserRule([replacement], replacement)).toEqual([]);
});

test("editing a rule replaces it in place and drops a colliding duplicate", () => {
  const first = readUserRules([mapRule, preserveRule]);
  const edited = { ...mapRule, host: "example.com", target: "accent" as const };
  const next = replaceUserRule(first, first[0]!, edited);
  expect(next).toHaveLength(2);
  expect(next[0]).toEqual(edited);
  expect(userRuleKey(next[0]!)).toBe(userRuleKey(edited));

  const colliding = { ...mapRule, host: "example.com", createdAt: 9 };
  const deduped = replaceUserRule([colliding, preserveRule], colliding, edited);
  expect(deduped.filter((rule) => userRuleKey(rule) === userRuleKey(edited))).toHaveLength(1);
});

test("shadow-scoped rules are separated from document rules", () => {
  const scoped = readUserRules([
    { ...preserveRule, selector: "article >>> .badge" },
    mapRule,
  ]);
  const engine = toEngineRules(scoped, "example.com");
  expect(engine.shadowRules?.map((rule) => rule.selector)).toEqual([
    "article >>> .badge",
  ]);
  expect(engine.css).toBe("");
  expect(engine.preserveInline).toEqual([]);
  expect(engine.colorMaps).toHaveLength(1);

  const lightOnly = toEngineRules(readUserRules([mapRule]), "example.com");
  expect(lightOnly.shadowRules).toBeUndefined();
});
