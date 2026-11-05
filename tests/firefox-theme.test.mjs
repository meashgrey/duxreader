import { expect, test } from "bun:test";
import { fromFirefoxTheme, hexColor } from "../lib/firefox-theme.ts";

test("Firefox normalized colors and Pywalfox hex colors are accepted safely", () => {
  expect(hexColor("rgb(17, 19, 24)")).toBe("#111318");
  expect(hexColor("rgba(17, 19, 24, 1)")).toBe("#111318");
  expect(hexColor([17, 19, 24])).toBe("#111318");
  expect(hexColor("#aBc")).toBe("#aabbcc");
  for (const value of [
    "red;}",
    "rgb(500,0,0)",
    "rgba(0,0,0,0)",
    [0, 0, "0"],
    [0, 0, 0, 0],
  ])
    expect(hexColor(value)).toBeUndefined();
});

test("Pywalfox mappings preserve its effective colors and light-mode property", () => {
  expect(
    fromFirefoxTheme({
      colors: {
        ntp_background: "#eeeeee",
        ntp_text: "#222222",
        toolbar: "#ffffff",
        icons: "#6750a4",
      },
      properties: { content_color_scheme: "light" },
    }),
  ).toEqual({
    mode: "light",
    colors: {
      background: "#eeeeee",
      foreground: "#222222",
      surface: "#ffffff",
      accent: "#6750a4",
    },
    css: "",
  });
  expect(fromFirefoxTheme({})).toBeUndefined();
  expect(
    fromFirefoxTheme({ colors: { ntp_background: "#ffffff" } }),
  ).toBeUndefined();
});
