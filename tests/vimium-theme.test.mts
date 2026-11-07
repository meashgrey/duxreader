import { expect, test } from "bun:test";
import { vimiumContentTheme } from "../lib/vimium/content-theme.ts";
import type { Theme } from "../lib/theme.ts";

const theme: Theme = {
  mode: "dark",
  css: "",
  colors: {
    background: "#111318",
    surface: "#1d2024",
    foreground: "#e1e2e9",
    accent: "#a8c8ff",
  },
  material: {
    primary: "#a8c8ff",
    "on-primary": "#06305f",
    "primary-container": "#254777",
    "on-primary-container": "#d5e3ff",
    surface: "#111318",
    "on-surface": "#e1e2e9",
    "surface-container": "#14161b",
    "surface-container-high": "#282a2f",
    "surface-container-highest": "#33353a",
    "surface-container-lowest": "#0c0e13",
    error: "#ffb4ab",
    "on-error": "#690005",
  },
};

test("Vimium content UI uses the shared palette roles", () => {
  const css = vimiumContentTheme(theme);
  expect(css).toContain("--vimium-background-color: #14161b");
  expect(css).toContain("--vimium-link-color: #a8c8ff");
  expect(css).toContain("background: #254777 !important");
  expect(css).toContain("border-color: #a8c8ff !important");
  expect(css).toContain("color: #d5e3ff !important");
  expect(css).toContain("color-scheme: dark");
  expect(css).not.toContain("#fff785");
});

test("Vimium content UI follows palette and mode changes", () => {
  const light = vimiumContentTheme({
    ...theme,
    mode: "light",
    material: {
      ...theme.material,
      primary: "#005ac1",
      "primary-container": "#d8e2ff",
    },
  });
  expect(light).toContain("--vimium-link-color: #005ac1");
  expect(light).toContain("background: #d8e2ff !important");
  expect(light).toContain("color-scheme: light");
});
