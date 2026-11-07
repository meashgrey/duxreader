import { describe, expect, test } from "bun:test";
import { materialRoles } from "../lib/material.ts";
import { defaultTheme, isTheme } from "../lib/theme.ts";

describe("Matugen Material 3 roles", () => {
  test("preserves supplied colors without regenerating from a seed", () => {
    const theme = {
      ...defaultTheme,
      material: {
        primary: "#123456",
        "on-primary": "#ffffff",
        "error-container": "#93000a",
      },
    };
    expect(isTheme(theme)).toBe(true);
    expect(materialRoles(theme).primary).toBe("#123456");
    expect(materialRoles(theme)["error-container"]).toBe("#93000a");
  });
  test("supports legacy files with readable button text", () => {
    const legacy = { ...defaultTheme, material: undefined };
    expect(materialRoles(legacy)["on-primary"]).toBe("#000000");
    expect(
      materialRoles({
        ...legacy,
        colors: { ...defaultTheme.colors, accent: "#000000" },
      })["on-primary"],
    ).toBe("#ffffff");
  });
  test("rejects unsafe role names and color values", () => {
    expect(
      isTheme({ ...defaultTheme, material: { "primary; color": "#ffffff" } }),
    ).toBe(false);
    expect(isTheme({ ...defaultTheme, material: { primary: "red;}" } })).toBe(
      false,
    );
    expect(isTheme({ ...defaultTheme, material: [] })).toBe(false);
  });
});
