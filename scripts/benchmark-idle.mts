import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : (args[i + 1] ?? fallback);
};
const source = resolve(option("--source", ".")),
  label = option("--label", "idle-current");
const seconds = Number(option("--seconds", "16")),
  warmup = Number(option("--warmup", "8"));
if (
  !Number.isInteger(seconds) ||
  seconds < 3 ||
  seconds > 120 ||
  !Number.isInteger(warmup) ||
  warmup < 1 ||
  warmup >= seconds
)
  throw new Error("Use 3–120 seconds with a shorter positive warmup");
if (!/^[a-z0-9_-]+$/i.test(label))
  throw new Error("Use a simple benchmark label");
const transition = !args.includes("--no-transition");
await mkdir(".temp/benchmarks", { recursive: true });
const entry = resolve(".temp/benchmarks/idle-entry.ts");
await Bun.write(
  entry,
  `import{createPageRenderer}from${JSON.stringify(source + "/lib/page-renderer.ts")};import{idleBenchmark}from${JSON.stringify(resolve("tests/browser/idle-benchmark.ts"))};idleBenchmark(()=>createPageRenderer()).then(result=>fetch('/result',{method:'POST',body:JSON.stringify(result)})).catch(error=>fetch('/result',{method:'POST',body:JSON.stringify({error:String(error)})}));`,
);
const build = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
});
if (!build.success)
  throw new AggregateError(build.logs, "Idle fixture build failed");
const code = await build.outputs[0]!.text();
const linux = process.platform === "linux";
const hz = linux
  ? Number(
      await new Response(
        Bun.spawn(["getconf", "CLK_TCK"], { stdout: "pipe" }).stdout,
      ).text(),
    )
  : 0;
type IdleResult = Awaited<
  ReturnType<typeof import("../tests/browser/idle-benchmark").idleBenchmark>
> & { error?: string };
const response: { value?: IdleResult } = {};
let child: Bun.Subprocess<"ignore", "ignore", "pipe"> | undefined;
let started = 0,
  lastAt = 0,
  lastTicks = new Map<number, number>();
const cpu: { startSecond: number; endSecond: number; cpuPercent: number }[] =
  [];
async function ticks(
  pid: number,
  seen = new Set<number>(),
): Promise<Map<number, number>> {
  if (seen.has(pid)) return new Map();
  seen.add(pid);
  const output = new Map<number, number>();
  try {
    const stat = await Bun.file(`/proc/${pid}/stat`).text();
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    output.set(pid, Number(fields[11]) + Number(fields[12]));
    const children = (
      await Bun.file(`/proc/${pid}/task/${pid}/children`).text()
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    for (const descendant of await Promise.all(
      children.map((id) => ticks(id, seen)),
    ))
      for (const [id, value] of descendant) output.set(id, value);
  } catch {}
  return output;
}
async function collect() {
  if (!linux || !child || !started) return;
  const current = await ticks(child.pid),
    now = performance.now();
  let delta = 0;
  for (const [pid, value] of current)
    delta += Math.max(0, value - (lastTicks.get(pid) ?? 0));
  if (lastAt)
    cpu.push({
      startSecond: (lastAt - started) / 1000,
      endSecond: (now - started) / 1000,
      cpuPercent: (delta / hz / ((now - lastAt) / 1000)) * 100,
    });
  lastTicks = current;
  lastAt = now;
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/idle.js")
      return new Response(code, {
        headers: { "content-type": "application/javascript" },
      });
    if (path === "/started") {
      started = performance.now();
      await collect();
      return new Response("ok");
    }
    if (path === "/result") {
      response.value = await request.json();
      return new Response("ok");
    }
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="benchmark-seconds" content="${seconds}"><script defer src="/idle.js"></script>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
const profile = await mkdtemp(resolve(".temp/benchmarks/idle-profile-"));
await Bun.write(
  resolve(profile, "user.js"),
  'user_pref("focusmanager.testmode",true);user_pref("browser.aboutwelcome.enabled",false);user_pref("browser.shell.checkDefaultBrowser",false);user_pref("browser.startup.homepage_override.mstone","ignore");',
);
try {
  child = Bun.spawn(
    [
      process.env.FIREFOX_BINARY ?? "firefox",
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      server.url.href + (transition ? "?transition=1" : ""),
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const deadline = performance.now() + seconds * 1000 + 15000;
  while (
    !response.value &&
    child.exitCode === null &&
    performance.now() < deadline
  ) {
    await Bun.sleep(500);
    await collect();
  }
  const result = response.value;
  if (!result || result.error)
    throw new Error(
      JSON.stringify(result ?? { error: "Idle benchmark timed out" }),
    );
  const steady = cpu.filter(
    (sample) => sample.startSecond >= warmup && sample.endSecond <= seconds,
  );
  const duration = steady.reduce(
    (sum, s) => sum + s.endSecond - s.startSecond,
    0,
  );
  const steadyCPU = duration
    ? steady.reduce(
        (sum, s) => sum + s.cpuPercent * (s.endSecond - s.startSecond),
        0,
      ) / duration
    : null;
  const output = {
    label,
    seconds,
    warmup,
    created: new Date().toISOString(),
    cpuMethod: linux
      ? "Linux /proc process family; 100% equals one core; warmup excluded"
      : "unavailable",
    steadyCPUPercent: steadyCPU,
    ...result,
    cpuSamples: cpu,
  };
  await Bun.write(
    `.temp/benchmarks/${label}.json`,
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
  if (
    args.includes("--check") &&
    result.samples
      .slice(warmup)
      .some((sample) => sample.reads > 16 || sample.frames > 2)
  )
    throw new Error("An idle page kept resampling after warmup");
} finally {
  child?.kill();
  if (child) await child.exited;
  server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
