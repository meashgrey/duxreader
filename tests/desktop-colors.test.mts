import { expect, test } from "bun:test";
import { mapDesktopColor } from "../lib/engine/desktop-colors.ts";
import { parseColor } from "../lib/color-roles.ts";
const palette = {
  colors: {
    background: "#061003",
    surface: "#293426",
    foreground: "#d3ddcf",
    accent: "#a0cf93",
  },
  material: { "outline-variant": "#4a5545" },
};
test("desktop policy preserves alpha for every role without DOM access", () => {
  for (const role of ["background", "text", "border"] as const) {
    const result = mapDesktopColor(
      parseColor("rgba(255,255,255,.4)")!,
      role,
      palette,
    );
    if (!result) throw new Error("Expected a mapped color");
    expect(result.a).toBe(0.4);
    expect([result.r, result.g, result.b]).toEqual(
      Object.values(
        parseColor(
          role === "background"
            ? palette.colors.background
            : role === "text"
              ? palette.colors.foreground
              : palette.material["outline-variant"],
        )!,
      ).slice(0, 3),
    );
  }
});
test("desktop policy leaves semantic hues on the upstream transform path", () => {
  for (const value of ["#ff0000", "#00ff00", "#ffff00"] as const) {
    for (const role of ["background", "text", "border"] as const)
      expect(
        mapDesktopColor(parseColor(value)!, role, palette),
      ).toBeUndefined();
  }
  expect(
    mapDesktopColor(parseColor("#fff")!, "background", undefined),
  ).toBeUndefined();
});
test("surface and accent changes produce new exact colors", () => {
  const changed = {
    ...palette,
    colors: { ...palette.colors, surface: "#455040", accent: "#adcdaa" },
  };
  expect(mapDesktopColor(parseColor("#eee")!, "background", changed)).toEqual(
    parseColor(changed.colors.surface)!,
  );
  expect(mapDesktopColor(parseColor("#2563eb")!, "text", changed)).toEqual(
    parseColor(changed.colors.accent)!,
  );
  expect(
    mapDesktopColor(parseColor("#d0bcff")!, "background", changed),
  ).toEqual(parseColor(changed.colors.surface)!);
});

test("a native dark page background maps to desktop background without flattening nearby surfaces", () => {
  const native = { ...palette, sourceBackground: parseColor("#0d1117")! };
  expect(mapDesktopColor(parseColor("#0d1117")!, "background", native)).toEqual(
    parseColor(palette.colors.background)!,
  );
  expect(mapDesktopColor(parseColor("#161b22")!, "background", native)).toEqual(
    parseColor(palette.colors.surface)!,
  );
});
