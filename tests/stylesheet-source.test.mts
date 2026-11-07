import { expect, test } from "bun:test";
import { createStylesheetReader } from "../lib/stylesheet-source.ts";
import { stylesheetImports } from "../lib/rendering/css-imports.ts";

test("CSS imports preserve URL bases and media tails without following quoted content", () => {
  const result = stylesheetImports(
    `/* @import "ignored.css"; */
@import url("../base.css") layer(theme) supports(display:grid) screen and (min-width: 400px);
@import './palette.css' print;
p::before { content:'@import "fake.css";'; }
@media all { @import "invalid-nested.css"; }`,
    "https://example.org/css/page/main.css",
  );
  expect(result.imports).toEqual([
    {
      url: "https://example.org/css/base.css",
      media: "screen and (min-width: 400px)",
      layer: "theme",
      supports: "display:grid",
    },
    { url: "https://example.org/css/page/palette.css", media: "print" },
  ]);
  expect(result.css).toContain(`content:'@import "fake.css";'`);
  expect(result.css).not.toContain("layer(theme)");
});
test("the stylesheet reader validates requests and omits credentials", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const read = createStylesheetReader(async (url, options) => {
    calls.push({ url, options });
    return new Response(".card{color:red}", {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  });
  expect(await read("file:///etc/passwd")).toMatchObject({ ok: false });
  expect(await read("https://user:secret@example.org/style.css")).toMatchObject(
    { ok: false },
  );
  expect(calls.length).toBe(0);
  expect(await read("https://example.org/style.css#fragment")).toEqual({
    ok: true,
    css: ".card{color:red}",
  });
  expect(calls[0]!.url).toBe("https://example.org/style.css");
  expect(calls[0]!.options!.credentials).toBe("omit");
});
test("duplicate stylesheet reads share a request and enforce response limits", async () => {
  let calls = 0;
  const read = createStylesheetReader(async () => {
    calls++;
    await Promise.resolve();
    return new Response("x{}", { headers: { "content-type": "text/css" } });
  });
  const results = await Promise.all([
    read("https://example.org/a.css"),
    read("https://example.org/a.css"),
  ]);
  expect(calls).toBe(1);
  expect(results[0]).toEqual(results[1]);
  const oversized = createStylesheetReader(
    async () =>
      new Response("x".repeat(2 * 1024 * 1024 + 1), {
        headers: { "content-type": "text/css" },
      }),
  );
  expect(await oversized("https://example.org/large.css")).toMatchObject({
    ok: false,
    error: expect.stringContaining("2 MiB"),
  });
  const html = createStylesheetReader(
    async () =>
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  expect(await html("https://example.org/login")).toMatchObject({ ok: false });
});
test("stylesheet reads bound simultaneous network requests", async () => {
  let active = 0,
    peak = 0;
  const read = createStylesheetReader(async () => {
    active++;
    peak = Math.max(active, peak);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return new Response("x{}", { headers: { "content-type": "text/css" } });
  });
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => read(`https://example.org/${i}.css`)),
  );
  expect(results.every((result) => result.ok)).toBe(true);
  expect(peak).toBe(4);
});
