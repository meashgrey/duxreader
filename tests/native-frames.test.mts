import { expect, test } from "bun:test";
import { isNativeFrame } from "../lib/native-frames.ts";

test("GitHub Mermaid render frames keep their native colors", () => {
  expect(
    isNativeFrame(
      new URL(
        "https://viewscreen.githubusercontent.com/markdown/mermaid?docs_host=https%3A%2F%2Fdocs.github.com",
      ),
    ),
  ).toBe(true);
});

test("other pages and render frames continue to receive the theme", () => {
  for (const url of [
    "https://github.com/arras-energy/gridlabd",
    "https://github.com/meashgrey/duxreader",
    "https://viewscreen.githubusercontent.com/markdown/math?docs_host=https%3A%2F%2Fdocs.github.com",
    "https://viewscreen.githubusercontent.com.evil.example/markdown/mermaid",
    "https://example.org/markdown/mermaid",
  ])
    expect(isNativeFrame(new URL(url))).toBe(false);
});
