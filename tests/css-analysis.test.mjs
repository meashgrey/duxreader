import { expect, test } from "bun:test";
import {
  splitSelectors,
  variablesIn,
  VariableGraph,
  pseudoHost,
  isPaletteTransition,
  interactionSelector,
  isStateSelector,
} from "../lib/rendering/css-analysis.ts";
import { mapEffect } from "../lib/rendering/effects.ts";

test("typing checks only dependent states, including nested and escaped selectors", () => {
  expect(interactionSelector(".card:hover", "input")).toBe(false);
  expect(interactionSelector(".editor:empty", "keydown")).toBe(false);
  expect(interactionSelector("form:has(input:valid) .message", "input")).toBe(
    true,
  );
  expect(interactionSelector("input:placeholder-shown", "input")).toBe(true);
  expect(interactionSelector("input:out-of-range", "change")).toBe(true);
  expect(interactionSelector("button:active span", "keyup")).toBe(true);
  expect(interactionSelector("button:focus-visible", "keydown")).toBe(true);
  expect(interactionSelector("input:\\76 alid", "input")).toBe(true);
  expect(interactionSelector(".sm\\:card:hover", "input")).toBe(false);
  expect(isStateSelector(".sm\\:card")).toBe(false);
  expect(isStateSelector("input:out-of-range")).toBe(true);
});

test("selector lists preserve functional selectors, escapes, and quoted commas", () => {
  expect(
    splitSelectors(
      ':is(.a,.b), [data-label="a,b"]::before, .escaped\\,name, :has(> :not(.x,.y))',
    ),
  ).toEqual([
    ":is(.a,.b)",
    '[data-label="a,b"]::before',
    ".escaped\\,name",
    ":has(> :not(.x,.y))",
  ]);
  expect(pseudoHost(":is(.a,.b):focus::before")).toEqual({
    host: ":is(.a,.b):focus",
    pseudo: "before",
  });
  expect(pseudoHost("div > ::after")).toEqual({
    host: "div > *",
    pseudo: "after",
  });
});
test("pseudo hosts distinguish descendant syntax and quoted pseudo names", () => {
  expect(pseudoHost("span ::before")).toEqual({
    host: "span *",
    pseudo: "before",
  });
  expect(pseudoHost('[data-label="::before"]')).toEqual({
    host: '[data-label="::before"]',
  });
});
test("variable references include nested fallbacks but exclude strings and URL data", () => {
  expect(
    variablesIn(
      'var(--first, var(--second, #fff)) "var(--fake)" url(var(--payload)) /* var(--comment) */',
    ),
  ).toEqual(new Set(["--first", "--second"]));
});
test("variable roles and consumers propagate through aliases, fallbacks, and cycles", () => {
  const graph = new VariableGraph(),
    definitions = {},
    consumers = {};
  graph.replace(definitions, [
    {
      selector: ":root",
      declarations: [
        { property: "--alias", value: "var(--shared, var(--fallback))" },
        { property: "--shared", value: "var(--cycle)" },
        { property: "--cycle", value: "var(--shared)" },
      ],
    },
  ]);
  graph.replace(consumers, [
    {
      selector: ".card",
      declarations: [{ property: "background-color", value: "var(--alias)" }],
    },
    {
      selector: ".text::before",
      declarations: [{ property: "color", value: "var(--shared)" }],
    },
  ]);
  graph.rebuild();
  expect(graph.roles("--cycle")).toEqual(new Set(["background", "foreground"]));
  expect(graph.selectors(["--shared"])).toEqual(
    new Set([".card", ".text::before"]),
  );
  expect(graph.selectors(["--fallback"])).toEqual(new Set([".card"]));
  graph.replace(consumers, [
    {
      selector: ".replacement",
      declarations: [{ property: "border-color", value: "var(--alias)" }],
    },
  ]);
  graph.rebuild();
  expect(graph.roles("--shared")).toEqual(new Set(["border"]));
  expect(graph.selectors(["--shared"])).toEqual(new Set([".replacement"]));
  graph.replace(consumers);
  graph.rebuild();
  expect(graph.selectors(["--shared"]).size).toBe(0);
});
test("gradient and shadow transforms preserve geometry and use palette variables", () => {
  expect(
    mapEffect(
      "linear-gradient(30deg, rgb(255, 255, 255) 10%, rgb(200, 200, 200) 80%)",
      "image",
      "rgb(255, 255, 255)",
    ),
  ).toBe("linear-gradient(30deg, var(--dux-bg) 10%, var(--dux-surface) 80%)");
  expect(mapEffect("rgb(0, 0, 0) 2px 4px 8px", "shadow", "#ffffff")).toBe(
    "var(--dux-border) 2px 4px 8px",
  );
  expect(
    mapEffect('url("https://example.org/image.png")', "image", "#ffffff"),
  ).toBeUndefined();
  expect(
    mapEffect(
      "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))",
      "image",
      "#ffffff",
    ),
  ).toBeUndefined();
});

test("effect recoloring preserves source alpha", () => {
  expect(
    mapEffect("rgba(0, 0, 0, 0.25) 2px 4px 8px", "shadow", "#ffffff"),
  ).toBe("color-mix(in srgb, var(--dux-border) 25%, transparent) 2px 4px 8px");
});

test("palette transition completion cannot retrigger sampling; layout transitions remain observable", () => {
  for (const property of [
    "color",
    "background-color",
    "border-inline-end-color",
    "outline-color",
    "box-shadow",
    "text-shadow",
    "background-image",
    "fill",
    "stroke",
    "color-scheme",
    "--dux-bg",
  ])
    expect(isPaletteTransition(property)).toBe(true);
  for (const property of [
    "opacity",
    "transform",
    "width",
    "height",
    "margin-left",
    "background-position-x",
  ])
    expect(isPaletteTransition(property)).toBe(false);
});
