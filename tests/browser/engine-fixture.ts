import { createPageRenderer } from "../../lib/page-renderer";
import { installCSSOMProxy } from "../../lib/rendering/cssom-proxy";
import { mechanismChecks } from "./mechanism-checks";
import type { Theme } from "../../lib/theme";

const checks: string[] = [];
(window as unknown as { regressionErrors: string[] }).regressionErrors = [];
window.addEventListener("error", (event) =>
  (window as unknown as { regressionErrors: string[] }).regressionErrors.push(
    String(event.error ?? event.message),
  ),
);
function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
  checks.push(label);
}
async function waitFor(predicate: () => boolean) {
  const deadline = performance.now() + 6000;
  while (!predicate()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for page styles");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
const color = (
  element: Element,
  property: "color" | "backgroundColor" = "backgroundColor",
) => getComputedStyle(element)[property];
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
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
async function run() {
  const originalInsertRule = CSSStyleSheet.prototype.insertRule;
  const releaseProxy = installCSSOMProxy();
  const panel = document.querySelector<HTMLElement>(".panel")!;
  const inline = document.querySelector<HTMLElement>("#inline")!;
  const card = document.createElement("section");
  card.style.cssText =
    "background:#eee;color:#111;border:1px solid #999;padding:12px";
  card.textContent = "Secondary surface";
  const button = document.createElement("button");
  button.style.cssText = "background:#2563eb;color:white";
  button.innerHTML = "<span>Accent control</span>";
  card.append(button);
  document.body.append(card);
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    "<style>p{background:white;color:black}</style><p>Shadow content</p>";
  document.body.append(host);
  const readURLs = new Set<string>();
  const renderer = createPageRenderer(document, {
    async readCSS(url) {
      readURLs.add(url);
      if (url.includes("unavailable-index"))
        throw new Error("Simulated stylesheet reader failure");
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Stylesheet unavailable");
      return response.text();
    },
  });
  renderer.apply(theme, true);
  assert(
    CSSStyleSheet.prototype.insertRule !== originalInsertRule,
    "The page-world CSSOM helper activates with the renderer",
  );
  await waitFor(
    () =>
      color(panel) === rgb(theme.colors.background) &&
      color(card) === rgb(theme.colors.surface),
  );
  assert(
    color(document.body) === rgb(theme.colors.background),
    "Page background equals the desktop background exactly",
  );
  assert(
    color(panel, "color") === rgb(theme.colors.foreground),
    "Neutral text equals the desktop foreground exactly",
  );
  assert(
    color(card) === rgb(theme.colors.surface),
    "Cards use the provided secondary surface",
  );
  assert(
    color(panel.querySelector("a")!, "color") === rgb(theme.colors.accent),
    "Links use the provided accent",
  );
  assert(
    color(button) === rgb(theme.colors.accent),
    "Primary buttons use the provided accent",
  );
  assert(
    color(button.firstElementChild!, "color") === rgb(theme.colors.background),
    "Nested button text uses a contrasting palette color",
  );
  await waitFor(
    () =>
      color(inline) === rgb(theme.colors.background) &&
      color(shadow.querySelector("p")!) === rgb(theme.colors.background),
  );
  assert(
    inline.style.backgroundColor === "white",
    "Source inline styles remain unchanged",
  );
  assert(
    color(shadow.querySelector("p")!, "color") === rgb(theme.colors.foreground),
    "Open shadow roots follow the same palette",
  );

  const late = document.createElement("div");
  late.className = "panel";
  late.textContent = "Inserted content";
  document.body.append(late);
  await waitFor(() => color(late) === rgb(theme.colors.background));
  assert(true, "New DOM content is classified automatically");
  card.style.backgroundColor = "white";
  await waitFor(() => color(card) === rgb(theme.colors.background));
  assert(
    true,
    "Inline style mutations trigger reclassification from original colors",
  );
  card.style.backgroundColor = "#eee";
  await waitFor(() => color(card) === rgb(theme.colors.surface));
  assert(
    true,
    "Repeated scans retain the original surface role without color drift",
  );

  const utility = document.createElement("style");
  utility.textContent =
    "body div.panel{background:#fff!important;color:#111!important}";
  document.head.append(utility);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    color(late) === rgb(theme.colors.background),
    "Site important utility rules retain the desktop background",
  );
  utility.remove();

  const sheet = document.createElement("style");
  document.head.append(sheet);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  late.id = "cssom-test";
  sheet.sheet!.insertRule("#cssom-test{background:#eee;border-radius:8px}");
  await waitFor(() => color(late) === rgb(theme.colors.surface));
  assert(true, "CSSOM rule insertion triggers reclassification");

  await mechanismChecks(theme, assert, waitFor, readURLs);

  const light: Theme = {
    mode: "light",
    css: "",
    colors: {
      background: "#fafafa",
      surface: "#eeeeee",
      foreground: "#202124",
      accent: "#335588",
    },
  };
  renderer.apply(light, true);
  await waitFor(() => color(panel) === rgb(light.colors.background));
  assert(
    color(panel, "color") === rgb(light.colors.foreground),
    "Palette changes use exact replacement colors",
  );
  assert(
    color(card) === rgb(light.colors.surface),
    "Existing roles survive a palette change",
  );
  renderer.apply(light, false);
  assert(
    CSSStyleSheet.prototype.insertRule === originalInsertRule,
    "Disable restores native CSSOM methods",
  );
  assert(
    color(panel) === "rgb(255, 255, 255)" &&
      color(panel, "color") === "rgb(17, 17, 17)",
    "Disable restores original site colors",
  );
  assert(
    !document.querySelector("[data-duxreader-bg],[data-duxreader-sheet]"),
    "Disable removes annotations and styles",
  );
  assert(
    !shadow.querySelector("[data-duxreader-bg],[data-duxreader-sheet]"),
    "Disable cleans shadow roots",
  );
  renderer.apply(theme, true);
  await waitFor(() => color(panel) === rgb(theme.colors.background));
  renderer.dispose();
  assert(
    color(inline) === "rgb(255, 255, 255)",
    "Dispose restores source inline styling",
  );
  renderer.apply(theme, true);
  await waitFor(() => color(panel) === rgb(theme.colors.background));
  document.querySelector("#result")!.textContent =
    `PASS · ${checks.length} browser checks`;
  assert(
    (window as unknown as { regressionErrors: string[] }).regressionErrors
      .length === 0,
    "No uncaught renderer errors occurred",
  );
  releaseProxy();
  return { ok: true, checks };
}
void run()
  .catch((error) => {
    document.querySelector("#result")!.textContent = String(error);
    const focus = document.querySelector(".focus-card");
    const errors = (window as unknown as { regressionErrors?: string[] })
      .regressionErrors;
    return {
      ok: false,
      checks,
      error: String(error),
      errors,
      focus: focus && {
        active: document.activeElement === focus,
        matches: focus.matches(":focus"),
        attributes: focus.outerHTML,
        bg: color(focus),
        pseudo: getComputedStyle(focus, "::before").backgroundColor,
        content: getComputedStyle(focus, "::before").content,
      },
    };
  })
  .then((result) =>
    fetch("/result", { method: "POST", body: JSON.stringify(result) }),
  );
