import { expect, test } from "bun:test";
import {
  declarationNames,
  compileDeclarations,
  mapRuleValue,
} from "../lib/rendering/rule-colors.ts";
import { guardSelector } from "../lib/rendering/style-manager.ts";

test("rule colors use palette variables and retain geometry, alpha, and semantic colors", () => {
  expect(mapRuleValue("linear-gradient(30deg,white 10%,#ccc 80%)", "bg")).toBe(
    "linear-gradient(30deg,var(--dux-bg) 10%,var(--dux-surface) 80%)",
  );
  expect(mapRuleValue("0 2px 4px rgb(128 128 128 / .5)", "edge")).toContain(
    "color-mix(in srgb,var(--dux-border) 50%,transparent)",
  );
  expect(mapRuleValue("red", "fg")).toBe("red");
  expect(mapRuleValue("#2563eb", "control")).toBe("var(--dux-accent)");
  expect(mapRuleValue("transparent", "bg")).toBe("transparent");
  expect(mapRuleValue("constructor toString __proto__", "bg")).toBe(
    "constructor toString __proto__",
  );
});
test("typed variable aliases retain browser substitution and contextual fallbacks", () => {
  expect(mapRuleValue("var(--alias,var(--tone,#fff))", "bg")).toBe(
    "var(--dux-value-bg-alias,var(--dux-value-bg-tone,var(--dux-bg)))",
  );
  expect(mapRuleValue("var(--tone)", "edge")).toBe(
    "var(--dux-value-edge-tone)",
  );
  expect(mapRuleValue("var(--fgColor-onEmphasis)", "fg")).toBe(
    "var(--dux-value-on-accent-fgColor-onEmphasis)",
  );
  expect(mapRuleValue("var(--fgColor-link)", "fg")).toBe(
    "var(--dux-value-link-fgColor-link)",
  );
  expect(
    mapRuleValue(
      'url("white.png")',
      "bg",
      "#fff",
      "https://example.org/css/theme.css",
    ),
  ).toBe('url("https://example.org/css/white.png")');
  expect(mapRuleValue('"white;#fff"', "bg")).toBe('"white;#fff"');
});
test("deferred shorthands and serialized declaration order survive compilation", () => {
  expect(
    declarationNames('background:var(--tone);--image:url("x;a:b");color:red;'),
  ).toEqual(["background", "--image", "color"]);
  const values: Record<string, string> = {
    background: "var(--tone)",
    color: "#111",
    border: "1px solid #999",
    width: "10px",
  };
  const style = {
    cssText:
      "background:var(--tone);color:#111;border:1px solid #999;width:10px;",
    getPropertyValue: (p: string) => values[p] ?? "",
    getPropertyPriority: (p: string) => (p === "color" ? "important" : ""),
  } as unknown as CSSStyleDeclaration;
  const css = compileDeclarations(style, ".row:hover", "#fff");
  expect(css).toContain("background:var(--dux-value-bg-tone);");
  expect(css).toContain("color:var(--dux-fg)!important;");
  expect(css).toContain("border:1px solid var(--dux-border);");
  expect(css).not.toContain("width");
  const semantic = {
    cssText: "color:red",
    getPropertyValue: (p: string) => (p === "color" ? "red" : ""),
    getPropertyPriority: () => "",
  } as unknown as CSSStyleDeclaration;
  expect(compileDeclarations(semantic, "span", "#fff", true)).toBe("");
  expect(compileDeclarations(semantic, "span", "#fff")).toBe("color:red;");
});
test("preservation guards precede pseudo-elements and add zero specificity", () => {
  expect(guardSelector(".row:focus::before")).toStartWith(".row:focus:where(");
  expect(guardSelector(".row:focus::before")).toEndWith("::before");
  expect(guardSelector("&:hover")).toStartWith("&:hover:where(");
  expect(guardSelector('[data-text="::before"]')).toStartWith(
    '[data-text="::before"]:where(',
  );
});
