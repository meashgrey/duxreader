import { expect, test } from "bun:test";
import {
  compileColorMaps,
  type ColorMap,
} from "../scripts/engine/color-map.mts";
import { siteColorMaps } from "../scripts/engine/sites/index.mts";
const colors = {
  background: "#17121c",
  surface: "#312838",
  foreground: "#e8def8",
  accent: "#d0bcff",
};
const map: ColorMap = {
  selector: ".header",
  property: "background-color",
  target: "background",
};
test("color maps resolve exclusively through theme roles and follow theme changes", () => {
  expect(compileColorMaps([map], colors)).toBe(
    ".header{background-color:#17121c!important;}",
  );
  expect(
    compileColorMaps([map], { ...colors, background: "#fafafa" }),
  ).toContain("#fafafa");
  expect(compileColorMaps([{ ...map, target: "accent" }], colors)).toContain(
    colors.accent,
  );
});
test("raw colors, arbitrary properties, and invalid palette values cannot be mapping targets", () => {
  const extendedPalette = { ...colors, extra: "#ffffff" };
  for (const target of [
    "#ff0000",
    "red",
    "var(--custom)",
    "constructor",
    "extra",
  ])
    expect(() =>
      compileColorMaps([{ ...map, target } as ColorMap], extendedPalette),
    ).toThrow();
  expect(() =>
    compileColorMaps(
      [{ ...map, property: "width" } as unknown as ColorMap],
      colors,
    ),
  ).toThrow();
  expect(() =>
    compileColorMaps([map], { ...colors, background: "red" }),
  ).toThrow();
});
test("GitHub header mappings are hostname-scoped and select theme background", () => {
  const maps = siteColorMaps(new URL("https://github.com/meashgrey"));
  expect(
    maps.some(
      (rule) =>
        rule.selector.includes("header.GlobalNav") &&
        rule.target === "background",
    ),
  ).toBe(true);
  expect(siteColorMaps(new URL("https://example.org/meashgrey"))).toEqual([]);
});

test("GitHub feed backdrop uses the base background instead of a surface", () => {
  const feed = siteColorMaps(new URL("https://github.com/feed")).find(
    (rule) => rule.selector === ".feed-background",
  );
  expect(feed).toEqual({
    selector: ".feed-background",
    property: "background-color",
    target: "background",
  });
  expect(compileColorMaps([feed!], colors)).toBe(
    ".feed-background{background-color:#17121c!important;}",
  );
});

test("merged state labels choose readable text against the accent fill", () => {
  const merged = siteColorMaps(
    new URL("https://github.com/philc/vimium/pull/4933"),
  ).find((rule) => rule.selector === '[data-status="pullMerged"]');
  expect(merged).toMatchObject({
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  });
  expect(compileColorMaps([merged!], colors)).toBe(
    '[data-status="pullMerged"]{color:#17121c!important;}',
  );
  const badge = siteColorMaps(
    new URL("https://github.com/chitin-dev/chitin/pull/54"),
  ).find((rule) => rule.selector.includes("color-bg-done-emphasis"));
  expect(badge).toMatchObject({
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  });
});

test("GitHub text input focus rings use the accent role", () => {
  const focusRules = siteColorMaps(
    new URL("https://github.com/search?q=owner%3Ameashgrey"),
  ).filter((rule) => rule.selector === ".TextInput-wrapper:focus-within");
  expect(focusRules).toHaveLength(2);
  expect(focusRules.map((rule) => rule.property)).toEqual([
    "border-color",
    "outline-color",
  ]);
  expect(compileColorMaps(focusRules, colors)).toContain(
    "border-color:#d0bcff!important",
  );
});

test("data intensity mixes use only theme endpoints and validate their weights", () => {
  expect(
    compileColorMaps(
      [{ ...map, target: "accent", mix: { with: "surface", weight: 25 } }],
      colors,
    ),
  ).toContain(`color-mix(in srgb, ${colors.accent} 25%, ${colors.surface})`);
  expect(() =>
    compileColorMaps(
      [{ ...map, mix: { with: "surface", weight: 101 } }],
      colors,
    ),
  ).toThrow();
  expect(() =>
    compileColorMaps(
      [{ ...map, mix: { with: "red", weight: 25 } } as unknown as ColorMap],
      colors,
    ),
  ).toThrow();
});
test("highlight text chooses contrast from the supplied palette rather than hard-coded black", () => {
  const rule: ColorMap = {
    selector: ".selected",
    property: "color",
    target: "background",
    contrastAgainst: "accent",
  };
  expect(compileColorMaps([rule], colors)).toContain(colors.background);
  const light = {
    ...colors,
    background: "#fafafa",
    foreground: "#17121c",
    accent: "#223344",
  };
  expect(compileColorMaps([rule], light)).toContain(light.background);
  expect(() =>
    compileColorMaps(
      [{ ...rule, contrastAgainst: "pink" } as unknown as ColorMap],
      colors,
    ),
  ).toThrow();
});
