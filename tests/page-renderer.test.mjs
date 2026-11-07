import { expect, test } from "bun:test";
import { classify, onAccent, parseColor } from "../lib/color-roles.ts";
import { mapDesktopColor } from "../lib/engine/desktop-colors.ts";

const facts = {
  background: "rgb(255, 255, 255)",
  foreground: "rgb(17, 17, 17)",
  border: "rgb(128, 128, 128)",
  pageBackground: "rgb(255, 255, 255)",
  pageForeground: "rgb(17, 17, 17)",
  control: false,
  link: false,
  large: false,
  container: true,
  onAccent: false,
  preserveSemantic: false,
};
test("page backgrounds and cards receive roles rather than transformed colors", () => {
  expect(classify(facts).background).toBe("base");
  expect(
    classify({ ...facts, background: "rgb(235, 235, 235)" }).background,
  ).toBe("surface");
  expect(
    classify({ ...facts, background: "rgb(235, 235, 235)", large: true })
      .background,
  ).toBe("base");
  expect(
    classify({ ...facts, background: "rgb(10, 40, 140)", large: true })
      .background,
  ).toBe("base");
  expect(
    classify({ ...facts, background: "transparent" }).background,
  ).toBeUndefined();
});
test("accent controls and links are distinguished from semantic colors", () => {
  expect(classify({ ...facts, link: true }).foreground).toBe("accent");
  expect(
    classify({ ...facts, control: true, background: "rgb(0, 90, 255)" }),
  ).toMatchObject({ background: "accent", foreground: "on-accent" });
  expect(
    classify({
      ...facts,
      control: true,
      background: "rgb(255, 0, 0)",
      preserveSemantic: true,
    }).background,
  ).toBeUndefined();
  expect(
    classify({ ...facts, background: "rgb(0, 255, 0)" }).background,
  ).toBeUndefined();
  expect(
    classify({ ...facts, background: "transparent", onAccent: true })
      .foreground,
  ).toBe("on-accent");
});
test("transparent edges and unsupported color syntax stay untouched", () => {
  expect(classify({ ...facts, border: "rgba(0, 0, 0, 0)" }).border).toBe(false);
  expect(parseColor("color(--unknown-space 1 0 0)")).toBeUndefined();
  expect(parseColor("rgb(20 30 40 / 0.5)")).toEqual({
    r: 20,
    g: 30,
    b: 40,
    a: 0.5,
  });
});
test("desktop color mapping uses exact palette endpoints", () => {
  const colors = {
    background: "#061003",
    surface: "#293426",
    foreground: "#d3ddcf",
    accent: "#a0cf93",
  };
  const palette = { colors };
  expect(mapDesktopColor(parseColor("#fff"), "background", palette)).toEqual(
    parseColor(colors.background),
  );
  expect(mapDesktopColor(parseColor("#eee"), "background", palette)).toEqual(
    parseColor(colors.surface),
  );
  expect(mapDesktopColor(parseColor("#111"), "text", palette)).toEqual(
    parseColor(colors.foreground),
  );
  expect(mapDesktopColor(parseColor("#2563eb"), "text", palette)).toEqual(
    parseColor(colors.accent),
  );
  expect(onAccent(colors.background, colors.foreground, colors.accent)).toBe(
    colors.background,
  );
});
