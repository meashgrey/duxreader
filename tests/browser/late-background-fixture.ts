import { createPageRenderer } from "../../lib/page-renderer";
import { installEngineProxy } from "../../lib/engine/proxy-host";
import type { Theme } from "../../lib/theme";

declare global {
  interface Window {
    __lateBackgroundResult?: {
      ok: boolean;
      checks: string[];
      error?: string;
    };
  }
}

const checks: string[] = [];
const errors: string[] = [];
window.addEventListener("error", (event) =>
  errors.push(String(event.error ?? event.message)),
);

function assert(value: unknown, label: string) {
  if (!value) throw new Error(label);
  checks.push(label);
}

const theme: Theme = {
  mode: "dark",
  css: "",
  colors: {
    background: "#061003",
    surface: "#293426",
    foreground: "#d3ddcf",
    accent: "#a0cf93",
  },
};

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

const bodyColor = () => getComputedStyle(document.body).backgroundColor;

async function waitFor(predicate: () => boolean, timeout = 6000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for the engine");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// This fixture guards the timing contract: once the engine is active, a page
// repaint must never leave the body on the surface role, not even for one
// frame. Whether a *stale* sample produces surface is asserted directly by
// tests/desktop-colors.test.mts, which can control the sample exactly.
//
// Records the body background on every frame for a short window.
function recordFrames(duration: number): Promise<string[]> {
  return new Promise((resolve) => {
    const seen: string[] = [];
    const start = performance.now();
    const tick = () => {
      seen.push(bodyColor());
      if (performance.now() - start < duration) requestAnimationFrame(tick);
      else resolve([...new Set(seen)]);
    };
    requestAnimationFrame(tick);
  });
}

async function run() {
  (window as unknown as { chrome?: unknown }).chrome ??= {};
  const release = installEngineProxy();

  // A page that paints white, then swaps in its real background later. This is
  // the shape that used to flip the main background onto the surface role once
  // the stylesheet landed.
  document.body.style.background = "#fff";
  document.body.style.color = "#111";
  document.body.innerHTML =
    '<div id="late-panel" style="padding:40px">Main content</div>';

  const renderer = createPageRenderer(document, {
    async readCSS() {
      throw new Error("No remote stylesheets in this fixture");
    },
  });
  renderer.apply(theme, true);
  await waitFor(() => bodyColor() === rgb(theme.colors.background));
  assert(
    bodyColor() === rgb(theme.colors.background),
    "the initial white page maps to the background role",
  );

  // The page repaints its own background after injection.
  const repaint = document.createElement("style");
  repaint.textContent =
    "html,body{background:#161b22!important;color:#e6edf3!important}";
  document.head.append(repaint);

  // The role must not fall back to surface at any point while it settles.
  const frames = await recordFrames(1200);
  assert(
    !frames.includes(rgb(theme.colors.surface)),
    `the background role never flips to surface (saw ${JSON.stringify(frames)})`,
  );
  await waitFor(() => bodyColor() === rgb(theme.colors.background));
  assert(
    bodyColor() === rgb(theme.colors.background),
    "a late page background stays on the background role",
  );

  // A second repaint must behave the same way.
  const second = document.createElement("style");
  second.textContent = "html,body{background:#0d1117!important}";
  document.head.append(second);
  const frames2 = await recordFrames(800);
  assert(
    !frames2.includes(rgb(theme.colors.surface)),
    `a second repaint never flips to surface (saw ${JSON.stringify(frames2)})`,
  );
  await waitFor(() => bodyColor() === rgb(theme.colors.background));
  assert(
    bodyColor() === rgb(theme.colors.background),
    "repeated page repaints keep the background role",
  );

  renderer.dispose();
  // The last page rule wins, so the native background is the second repaint.
  const native = "rgb(13, 17, 23)";
  await waitFor(() => bodyColor() === native);
  assert(
    bodyColor() === native,
    `disposing restores the page's own background (got ${bodyColor()})`,
  );
  release();
  assert(errors.length === 0, "no uncaught engine errors occurred");
}

run()
  .then(() => {
    window.__lateBackgroundResult = { ok: true, checks, error: errors[0] };
  })
  .catch((error) => {
    window.__lateBackgroundResult = { ok: false, checks, error: String(error) };
  });
