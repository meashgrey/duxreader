import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir(".temp", { recursive: true });
const profile = await mkdtemp(resolve(".temp/engine-browser-"));
// Run a normal headless tab: Firefox's --screenshot uses an inactive document
// where :focus never matches even if document.activeElement changes.
await Bun.write(
  resolve(profile, "user.js"),
  [
    'user_pref("focusmanager.testmode", true);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  ].join("\n"),
);
const build = await Bun.build({
  entrypoints: ["tests/browser/engine-fixture.ts"],
  target: "browser",
  format: "iife",
});
if (!build.success)
  throw new AggregateError(build.logs, "Browser fixture build failed");
const code = await build.outputs[0].text();
let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});
let result;
const cssServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    const css =
      path === "/remote.css"
        ? '@import "./remote-import.css"; .remote-card{background:#fff;color:#111;border:1px solid #999;border-radius:8px} .remote-card:focus{background:#eee} .remote-card:focus::before{content:"Remote";background:#eee;color:#111}'
        : path === "/remote-import.css"
          ? '@import "./remote-palette.css"; .remote-variable{background:var(--remote-tone);color:var(--remote-text);border:1px solid #999;border-radius:8px}'
          : path === "/remote-palette.css"
            ? ":root{--remote-tone:#eee;--remote-text:#111}"
            : ".unreadable-parent:focus-within .unreadable-child{background:#eee} .unreadable-child{background:#fff;color:#111;border:1px solid #999;border-radius:8px}";
    return new Response(css, {
      headers: {
        "content-type": "text/css",
        "access-control-allow-origin": "*",
      },
    });
  },
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/engine.js")
      return new Response(code, {
        headers: { "content-type": "application/javascript" },
      });
    if (path === "/result" && request.method === "POST") {
      result = await request.json();
      finish();
      return new Response("ok");
    }
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="duxreader-test-css-origin" content="${cssServer.url.origin}"><title>Desktop palette regression</title><style>body{margin:32px;font:16px/1.5 system-ui;background:white;color:#111}.panel{padding:24px;background:white;color:#111;border:1px solid #999;margin:16px 0}input,pre{background:#fff;color:#111}h1{font-size:24px}</style></head><body><h1>Desktop palette regression</h1><p id="result">Running checks…</p><section class="panel">Nested page surface <a href="#">Example link</a><pre>const theme = 'dynamic';</pre><input aria-label="Sample input" value="Native form control"></section><div id="inline" style="background:white;color:black;padding:24px">Inline surface</div><script src="/engine.js"></script></body></html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
let child, timeout;
try {
  child = Bun.spawn(
    [
      process.env.FIREFOX_BINARY ?? "firefox",
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      "--width",
      "1000",
      "--height",
      "800",
      server.url.href,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(resolve, 50000);
  });
  await Promise.race([finished, child.exited, deadline]);
  clearTimeout(timeout);
  child.kill();
  await child.exited;
  await Bun.write(
    ".temp/engine-browser-result.json",
    JSON.stringify(
      result ?? { ok: false, error: "No browser result" },
      null,
      2,
    ),
  );
  if (!result?.ok)
    throw new Error(
      JSON.stringify({
        result,
        stderr: await new Response(child.stderr).text(),
      }),
    );
  console.log(`Dynamic engine: ${result.checks.length} browser checks passed.`);
} finally {
  clearTimeout(timeout);
  child?.kill();
  server.stop(true);
  cssServer.stop(true);
  await rm(profile, { recursive: true, force: true });
}
