import { expect, test } from "bun:test";
import { readUserRules } from "../lib/inspector/rules.ts";

// Mirrors lib/preferences/custom-rules.tsx::readImport.
function readImport(text: string) {
  const parsed: unknown = JSON.parse(text);
  const candidate = Array.isArray(parsed)
    ? parsed
    : (parsed as { userSiteRules?: unknown })?.userSiteRules;
  return readUserRules(candidate);
}

function groupByHost(rules: readonly { host: string }[]) {
  const groups = new Map<string, number>();
  for (const rule of rules)
    groups.set(rule.host, (groups.get(rule.host) ?? 0) + 1);
  return [...groups.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
}

const mapRule = {
  kind: "map" as const,
  host: "github.com",
  selector: "h3 > a",
  property: "color" as const,
  target: "accent" as const,
  createdAt: 1,
};
const preserveRule = {
  kind: "preserve" as const,
  host: "opencode.ai",
  selector: ".badge",
  declarations: "color:rgb(9, 9, 9)!important;",
  createdAt: 2,
};

test("site rule exports round-trip through import", () => {
  const exported = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    userSiteRules: [mapRule, preserveRule],
  });
  expect(readImport(exported)).toEqual(readUserRules([mapRule, preserveRule]));
});

test("a bare rule array imports, so agent output can be pasted back", () => {
  expect(readImport(JSON.stringify([mapRule, preserveRule]))).toHaveLength(2);
});

test("import ignores invalid entries instead of failing the whole file", () => {
  expect(
    readImport(
      JSON.stringify([
        mapRule,
        { ...mapRule, property: "width" },
        { ...preserveRule, selector: ".a {}" },
        "nope",
      ]),
    ),
  ).toHaveLength(1);
});

test("exports group rules by host with the densest site first", () => {
  const rules = readUserRules([
    mapRule,
    { ...mapRule, selector: "h1", createdAt: 3 },
    preserveRule,
  ]);
  expect(groupByHost(rules)).toEqual([
    ["github.com", 2],
    ["opencode.ai", 1],
  ]);
});
