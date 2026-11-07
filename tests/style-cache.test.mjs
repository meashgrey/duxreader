import { expect, test } from "bun:test";
import { createStyleManager } from "../lib/rendering/style-manager.ts";

test("unchanged sheets avoid CSS text serialization and audits rotate one source at a time", () => {
  const names = ["CSSImportRule", "CSSStyleRule", "CSSKeyframesRule"];
  const originals = names.map((name) => globalThis[name]);
  for (const name of names) globalThis[name] = class {};
  try {
    let reads = 0;
    const sheets = Array.from({ length: 30 }, () => ({
      disabled: false,
      media: { mediaText: "" },
      href: null,
      cssRules: [
        {
          get cssText() {
            reads++;
            return "@layer fixture;";
          },
        },
      ],
    }));
    const manager = createStyleManager(
      { baseURI: "https://example.org/" },
      { background: "#fff", ready() {} },
    );
    const theme = {
      mode: "dark",
      css: "",
      colors: {
        background: "#000000",
        surface: "#222222",
        foreground: "#eeeeee",
        accent: "#aabbcc",
      },
    };
    for (const sheet of sheets) manager.compile(sheet, theme);
    reads = 0;
    for (const sheet of sheets) manager.compile(sheet, theme);
    expect(reads).toBe(0);
    for (let i = 0; i < 3; i++) {
      reads = 0;
      manager.auditNext(sheets);
      for (const sheet of sheets) manager.compile(sheet, theme);
      expect(reads).toBe(1);
    }
    reads = 0;
    manager.invalidateSource(sheets[10]);
    for (const sheet of sheets) manager.compile(sheet, theme);
    expect(reads).toBe(1);
    reads = 0;
    for (const sheet of sheets) manager.compile(sheet, theme, true);
    expect(reads).toBe(30);
    manager.dispose();
  } finally {
    names.forEach((name, i) => {
      if (originals[i] === undefined) delete globalThis[name];
      else globalThis[name] = originals[i];
    });
  }
});
