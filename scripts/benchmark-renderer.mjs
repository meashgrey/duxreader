import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i < 0 ? fallback : args[i + 1];
};
const label = value("--label", "current"),
  runs = Number(value("--runs", "3"));
const source = resolve(value("--source", "."));
const cards = Number(value("--cards", "80"));
const mode = value("--mode", "fallback");
await mkdir(".temp/benchmarks", { recursive: true });
const entry = resolve(".temp/benchmarks/entry.ts");
await Bun.write(
  entry,
  `import {createPageRenderer} from ${JSON.stringify(source + "/lib/page-renderer.ts")};import {benchmark} from ${JSON.stringify(resolve("tests/browser/benchmark.ts"))};benchmark(()=>createPageRenderer()).then(result=>fetch('/result',{method:'POST',body:JSON.stringify(result)})).catch(error=>fetch('/result',{method:'POST',body:JSON.stringify({error:String(error),stack:error.stack})}));`,
);
const build = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
});
if (!build.success)
  throw new AggregateError(build.logs, "Benchmark build failed");
const code = await build.outputs[0].text();
const bundleSHA256 = new Bun.CryptoHasher("sha256").update(code).digest("hex");
let finish, result;
const cssServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    new Response(".opaque{color:#111}", {
      headers: { "content-type": "text/css" },
    }),
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/bench.js")
      return new Response(code, {
        headers: { "content-type": "application/javascript" },
      });
    if (path === "/result") {
      result = await request.json();
      finish();
      return new Response("ok");
    }
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="bench-cards" content="${cards}"><meta name="bench-mode" content="${mode}"><meta name="css-origin" content="${cssServer.url.origin}"><script defer src="/bench.js"></script>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
const samples = [];
try {
  for (let run = 0; run < runs; run++) {
    const profile = await mkdtemp(resolve(".temp/benchmarks/profile-"));
    await Bun.write(
      resolve(profile, "user.js"),
      'user_pref("focusmanager.testmode",true);user_pref("browser.shell.checkDefaultBrowser",false);user_pref("browser.aboutwelcome.enabled",false);user_pref("browser.startup.homepage_override.mstone","ignore");',
    );
    let child, timer;
    result = undefined;
    try {
      const done = new Promise((resolve) => {
        finish = resolve;
      });
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
        { stdout: "ignore", stderr: "pipe" },
      );
      await Promise.race([
        done,
        child.exited,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 120000);
        }),
      ]);
      child.kill();
      await child.exited;
      clearTimeout(timer);
      if (!result || result.error)
        throw new Error(
          JSON.stringify(result ?? { error: "Benchmark timed out" }),
        );
      samples.push(result);
      console.log(
        `${label} ${run + 1}/${runs}: ${result.results.map((r) => `${r.name}=${r.callbackMs.toFixed(0)}ms/${r.computed} reads`).join(", ")}`,
      );
    } finally {
      clearTimeout(timer);
      child?.kill();
      await rm(profile, { recursive: true, force: true });
    }
  }
  const median = (values) => {
    const n = [...values].sort((a, b) => a - b);
    return n[Math.floor(n.length / 2)];
  };
  const summary = samples[0].results.map((phase, i) =>
    Object.fromEntries(
      Object.keys(phase).map((key) => [
        key,
        typeof phase[key] === "number"
          ? median(samples.map((s) => s.results[i][key]))
          : phase[key],
      ]),
    ),
  );
  const output = {
    label,
    runs,
    mode,
    cards,
    bundleSHA256,
    created: new Date().toISOString(),
    nodes: samples[0].nodes,
    userAgent: samples[0].userAgent,
    summary,
    samples,
  };
  await Bun.write(
    `.temp/benchmarks/${label}.json`,
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify({ label, summary }, null, 2));
  if (args.includes("--check")) {
    for (const sample of samples)
      for (const phase of sample.results) {
        if (phase.settled === false)
          throw new Error(`${phase.name}: renderer did not settle`);
        if (phase.matches > output.nodes * 32 + 1000)
          throw new Error(
            `${phase.name}: selector matching work budget exceeded`,
          );
        if (phase.name === "local-style" && phase.computed > 256)
          throw new Error("Local changes triggered a broad rescan");
        if (phase.name === "clock-text" && phase.computed > 16)
          throw new Error("Clock text triggered color rescanning");
        if (
          mode === "normal" &&
          phase.name === "mutation-burst" &&
          phase.computed > 128
        )
          throw new Error("Insertion work was not incremental");
      }
  }
} finally {
  server.stop(true);
  cssServer.stop(true);
}
