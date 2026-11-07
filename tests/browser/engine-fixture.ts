import { createPageRenderer } from "../../lib/page-renderer";
import { installEngineProxy } from "../../lib/engine/proxy-host";
import type { Theme } from "../../lib/theme";

const checks: string[] = [];
const errors: string[] = [];
window.addEventListener("error", (event) =>
  errors.push(String(event.error ?? event.message)),
);
function assert(value: unknown, label: string) {
  if (!value) throw new Error(label);
  checks.push(label);
}
async function waitFor(predicate: () => boolean) {
  const deadline = performance.now() + 6000;
  while (!predicate()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for upstream engine");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const color = (node: Element, property = "background-color") =>
  getComputedStyle(node).getPropertyValue(property);
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
function generatedCSS() {
  return [...document.querySelectorAll<HTMLStyleElement>("style.darkreader")]
    .map((style) =>
      [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText).join("\n"),
    )
    .join("\n");
}
async function run() {
  // Plain-tab fixtures have no extension runtime; upstream's optional PDF
  // integration only probes chrome.dom. Production uses the real browser API.
  (window as any).chrome ??= {};
  const nativeInsert = CSSStyleSheet.prototype.insertRule;
  const release = installEngineProxy();
  const panel = document.querySelector<HTMLElement>(".panel")!;
  const inline = document.querySelector<HTMLElement>("#inline")!;
  const source = document.createElement("style");
  source.textContent = `
    :root{--tone:#fff;--alias:var(--tone);--unused-size:20px;--future-color:#ddd}
    .variable{background:var(--alias);color:#111}
    .surface{background:#eee;color:#111}
    .focus-card{background:#fff;color:#111}
    .focus-card:focus{background:#eee}
    .focus-card:focus::before{content:"State";color:#111;background:#eee}
    .accent{color:#2563eb}
    .alpha{background:rgba(255,255,255,.4)}
  `;
  document.head.append(source);
  const area = document.createElement("section");
  area.innerHTML =
    '<div class="surface">Surface</div><div class="variable">Variables</div><button class="focus-card">Focus</button><a class="accent">Link</a><div class="alpha">Alpha</div><div data-duxreader-preserve style="background:white;color:black">Preserved inline</div>';
  document.body.append(area);
  const surface = area.querySelector(".surface")!;
  const variable = area.querySelector(".variable")!;
  const focus = area.querySelector<HTMLElement>(".focus-card")!;
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    "<style>p{background:white;color:black}</style><p>Shadow</p>";
  const readerURLs = new Set<string>();
  const renderer = createPageRenderer(document, {
    async readCSS(url) {
      readerURLs.add(url);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fixture stylesheet unavailable");
      return response.text();
    },
  });
  renderer.apply(theme, true);
  await waitFor(
    () =>
      color(panel) === rgb(theme.colors.background) &&
      color(surface) === rgb(theme.colors.surface),
  );
  assert(
    CSSStyleSheet.prototype.insertRule !== nativeInsert,
    "The upstream page-world proxy is active",
  );
  assert(
    color(document.body) === rgb(theme.colors.background),
    "The page background matches the desktop exactly",
  );
  assert(
    color(panel, "color") === rgb(theme.colors.foreground),
    "Neutral text matches the desktop exactly",
  );
  assert(
    color(area.querySelector(".accent")!, "color") === rgb(theme.colors.accent),
    "Blue links use the desktop accent",
  );
  assert(
    color(area.querySelector(".alpha")!).includes("0.4"),
    "Source alpha is preserved",
  );
  assert(
    color(area.querySelector("[data-duxreader-preserve]")!) ===
      "rgb(255, 255, 255)",
    "Preserved inline elements retain source colors",
  );
  await waitFor(
    () =>
      color(inline) === rgb(theme.colors.background) &&
      color(variable) === rgb(theme.colors.background),
  );
  assert(
    inline.style.backgroundColor === "white",
    "Source inline color declarations remain unchanged",
  );
  assert(
    inline.hasAttribute("data-darkreader-inline-bgcolor"),
    "Inline colors use upstream local overrides",
  );
  assert(
    !document.querySelector("[data-duxreader-node]"),
    "No global inline selector index is created",
  );
  await waitFor(
    () => color(shadow.querySelector("p")!) === rgb(theme.colors.background),
  );
  assert(
    color(shadow.querySelector("p")!, "color") === rgb(theme.colors.foreground),
    "Shadow styles use the desktop palette",
  );
  const beforeFocus = generatedCSS();
  focus.focus();
  await waitFor(() => color(focus) === rgb(theme.colors.surface));
  assert(
    getComputedStyle(focus, "::before").backgroundColor ===
      rgb(theme.colors.surface),
    "Pseudo-element state colors are precompiled",
  );
  assert(
    generatedCSS() === beforeFocus,
    "Focus does not regenerate stylesheets",
  );
  focus.blur();
  await waitFor(() => color(focus) === rgb(theme.colors.background));
  assert(
    generatedCSS() === beforeFocus,
    "Blur uses the browser cascade without compilation",
  );
  inline.style.backgroundColor = "#eee";
  await waitFor(() => color(inline) === rgb(theme.colors.surface));
  assert(
    generatedCSS() === beforeFocus,
    "Changing an inline color does not rebuild a global inline sheet",
  );
  inline.style.setProperty("--layout-width", "30px");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    !inline.style.cssText.includes("--darkreader-bg--layout-width"),
    "Layout variables receive no color projection",
  );
  source.textContent = source.textContent!.replace(
    "--tone:#fff",
    "--tone:#eee",
  );
  await waitFor(() => color(variable) === rgb(theme.colors.surface));
  assert(true, "Stylesheet variable updates propagate through aliases");
  assert(
    !generatedCSS().includes("--darkreader-placeholder-"),
    "Internal variable sentinels are not emitted into inherited CSS",
  );
  const future = document.createElement("div");
  future.className = "future-color";
  document.body.append(future);
  const futureStyle = document.createElement("style");
  futureStyle.textContent = ".future-color{background:var(--future-color)}";
  document.head.append(futureStyle);
  await waitFor(() => color(future) === rgb(theme.colors.surface));
  assert(
    true,
    "Previously unused variables activate through upstream type subscriptions",
  );
  const late = document.createElement("div");
  late.style.cssText = "background:white;color:black";
  area.append(late);
  await waitFor(() => color(late) === rgb(theme.colors.background));
  assert(true, "New inline elements are processed");
  const lateStyle = document.createElement("style");
  lateStyle.textContent = ".late-rule{background:#eee}";
  document.head.append(lateStyle);
  late.className = "late-rule";
  late.style.removeProperty("background");
  await waitFor(() => color(late) === rgb(theme.colors.surface));
  assert(true, "Dynamically inserted stylesheets are managed");
  lateStyle.sheet!.insertRule(".late-rule{background:white}", 1);
  await waitFor(() => color(late) === rgb(theme.colors.background));
  assert(true, "CSSOM rule insertion updates the owning stylesheet");
  const origin = document.querySelector<HTMLMetaElement>(
    '[name="duxreader-test-css-origin"]',
  )!.content;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = origin + "/remote.css";
  const remote = document.createElement("div");
  remote.className = "remote-card";
  document.body.append(remote);
  document.head.append(link);
  await waitFor(() => color(remote) === rgb(theme.colors.background));
  assert(
    readerURLs.has(link.href),
    "External stylesheets use the extension transport",
  );
  const replacement: Theme = {
    ...theme,
    colors: { ...theme.colors, surface: "#384532", accent: "#bbcdaa" },
  };
  renderer.apply(replacement, true);
  await waitFor(() => color(surface) === rgb(replacement.colors.surface));
  await waitFor(() => color(inline) === rgb(replacement.colors.surface));
  assert(
    color(area.querySelector(".accent")!, "color") ===
      rgb(replacement.colors.accent),
    "Accent-only changes invalidate cached colors",
  );
  assert(
    color(inline) === rgb(replacement.colors.surface),
    "Surface-only changes update cached inline colors",
  );
  const light: Theme = {
    mode: "light",
    css: "",
    colors: {
      background: "#fafafa",
      surface: "#eeeedd",
      foreground: "#202124",
      accent: "#335588",
    },
  };
  renderer.apply(light, true);
  await waitFor(() => color(panel) === rgb(light.colors.background));
  assert(
    color(panel, "color") === rgb(light.colors.foreground),
    "Light mode uses the supplied palette",
  );
  renderer.apply(light, false);
  assert(
    CSSStyleSheet.prototype.insertRule === nativeInsert,
    "Disable restores upstream CSSOM hooks",
  );
  assert(
    color(panel) === "rgb(255, 255, 255)",
    "Disable restores original stylesheet colors",
  );
  assert(
    color(inline) === "rgb(238, 238, 238)",
    "Disable restores original inline rendering",
  );
  assert(
    !document.querySelector("style.darkreader"),
    "Disable removes generated document styles",
  );
  assert(
    [...shadow.querySelectorAll<HTMLStyleElement>("style.darkreader")].every(
      (style) => !style.sheet?.cssRules.length,
    ) && color(shadow.querySelector("p")!) === "rgb(255, 255, 255)",
    "Disable removes active shadow overrides (upstream may retain empty style nodes)",
  );
  renderer.apply(theme, true);
  await waitFor(() => color(panel) === rgb(theme.colors.background));
  renderer.dispose();
  assert(
    color(panel) === "rgb(255, 255, 255)",
    "Repeated enable and dispose restore the page",
  );
  release();
  assert(errors.length === 0, "No uncaught renderer errors occurred");
  return { ok: true, checks };
}
void run()
  .catch((error) => ({
    ok: false,
    error: String(error),
    checks,
    errors,
    css: generatedCSS().slice(-10000),
  }))
  .then((result) =>
    fetch("/result", { method: "POST", body: JSON.stringify(result) }),
  );
