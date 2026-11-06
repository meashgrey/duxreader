import { expect, test } from "bun:test";
import { parseColor } from "../lib/rendering/color.ts";
import { neutral } from "../lib/color-roles.ts";

test("CSS colors normalize percent channels, alpha, and shorthand hex", () => {
  expect(parseColor("rgb(100% 0% 50% / 25%)")).toEqual({
    r: 255,
    g: 0,
    b: 128,
    a: 0.25,
  });
  expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  expect(parseColor("#0000")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  expect(parseColor("hsl(0.5turn 100% 50%)")).toEqual({
    r: 0,
    g: 255,
    b: 255,
    a: 1,
  });
  expect(parseColor("color(srgb 0.5 0.5 0.5 / .5)")).toEqual({
    r: 128,
    g: 128,
    b: 128,
    a: 0.5,
  });
});
test("Oklab and wide-gamut colors can be classified without canvas pixel access", () => {
  expect(parseColor("oklab(100% 0 0)")).toEqual({
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });
  expect(parseColor("oklch(0% 0 90)")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  expect(parseColor("oklab(0.5 0 0)")).toEqual({ r: 99, g: 99, b: 99, a: 1 });
  expect(neutral(parseColor("oklch(90% .01 120)"))).toBe(true);
  expect(neutral(parseColor("oklch(60% .2 30)"))).toBe(false);
  expect(parseColor("color(display-p3 1 1 1)")).toEqual({
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  });
  expect(parseColor("color(display-p3 1 0 0)")).toEqual({
    r: 255,
    g: 0,
    b: 0,
    a: 1,
  });
  expect(parseColor("color(srgb-linear 0 0 0)")).toEqual({
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  });
});
test("invalid and unresolved colors stay untouched", () => {
  for (const value of [
    "garbage",
    "var(--unresolved)",
    "rgb(NaN 0 0)",
    "color(--unknown 1 0 0)",
    "oklch(from red l c h)",
  ])
    expect(parseColor(value)).toBeUndefined();
});
