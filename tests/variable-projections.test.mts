import { expect, test } from "bun:test";
import { VariableProjections } from "../lib/rendering/variable-projections.ts";
import { compileDeclarations } from "../lib/rendering/rule-colors.ts";

test("only demanded variable roles are emitted, including aliases discovered later", () => {
  const graph = new VariableProjections(() => {});
  graph.define("--alias", "var(--tone,#fff)");
  graph.use("--alias", "bg");
  expect([...graph.roles("--tone")]).toEqual(["bg"]);
  graph.define("--late", "var(--tone)");
  graph.use("--late", "edge");
  expect(new Set(graph.roles("--tone"))).toEqual(new Set(["bg", "edge"]));
  const values: Record<string, string> = {
    "--tone": "#eee",
    "--spacing": "8px",
    "--font": "system-ui",
  };
  const style = {
    cssText: "--tone:#eee;--spacing:8px;--font:system-ui",
    getPropertyValue: (p: string) => values[p] ?? "",
    getPropertyPriority: () => "",
  } as unknown as CSSStyleDeclaration;
  const css = compileDeclarations(
    style,
    ":root",
    "#fff",
    false,
    undefined,
    "all",
    graph,
  );
  expect(css).toContain("--dux-value-bg-tone:var(--dux-surface)");
  expect(css).toContain("--dux-value-edge-tone:var(--dux-border)");
  expect(css).not.toContain("--dux-value-fg-tone");
  expect(css).not.toContain("spacing");
  expect(css).not.toContain("font");
  expect(
    compileDeclarations(
      style,
      "html",
      "#fff",
      true,
      undefined,
      "variables",
      new VariableProjections(() => {}),
    ),
  ).toBe("");
});
test("role demand propagates through cycles and late semantic aliases without repeated invalidation", () => {
  let notifications = 0;
  const graph = new VariableProjections(() => notifications++);
  graph.use("--one", "fg");
  graph.define("--one", "var(--two)");
  graph.define("--two", "var(--one,var(--fgColor-onEmphasis))");
  expect([...graph.roles("--two")]).toEqual(["fg"]);
  expect([...graph.roles("--fgColor-onEmphasis")]).toEqual(["on-accent"]);
  const before = notifications;
  graph.define("--one", "var(--two)");
  graph.use("--one", "fg");
  expect(notifications).toBe(before);
  graph.clear();
  expect(graph.roles("--one").size).toBe(0);
});
