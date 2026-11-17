import { compileColorMaps } from "../../scripts/engine/color-map.mts";
import { siteColorMaps } from "../../scripts/engine/sites/index.mts";
import { createPageRenderer } from "../../lib/page-renderer";
import { installEngineProxy } from "../../lib/engine/proxy-host";
import { getPreservedInlineSelectors } from "../../scripts/engine/semantic-colors.mts";
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
function mappedTheme(value: Theme): Theme {
  return {
    ...value,
    css: [
      compileColorMaps(
        siteColorMaps(new URL("https://github.com/meashgrey")),
        value.colors,
      ),
      value.css,
    ].join("\n"),
  };
}
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
    :root{--bgColor-inset:#151b23;--tone:#fff;--alias:var(--tone);--unused-size:20px;--future-color:#ddd}
    .variable{background:var(--alias);color:#111}
    .surface{background:#eee;color:#111}
    .focus-card{background:#fff;color:#111}
    .focus-card:focus{background:#eee}
    .focus-card:focus::before{content:"State";color:#111;background:#eee}
    .accent{color:#2563eb}
    .alpha{background:rgba(255,255,255,.4)}
    .AppHeader,.AppHeader-globalBar,.AppHeader-localBar{background:#eee;color:#111}
    .AppHeader button,.GlobalNav button{background:#eee;color:#111}
    .GlobalNav,.unmapped-inset{background:var(--bgColor-inset);color:#111}
    .ContributionCalendar-day{background:#40c463}
    .js-year-link{background:#eee;color:#111}
    .js-year-link.selected{background:#0969da;color:white}
  `;
  document.head.append(source);
  const header = document.createElement("header");
  header.className = "AppHeader";
  header.innerHTML =
    '<div class="AppHeader-globalBar"><button>Search</button></div><div class="AppHeader-localBar">Profile navigation</div>';
  document.body.append(header);
  const globalNav = document.createElement("header");
  globalNav.className = "GlobalNav styles-module_gNfHta_appHeader";
  globalNav.setAttribute("aria-label", "Global navigation menu");
  globalNav.dataset.component = "Stack";
  globalNav.innerHTML =
    '<div data-component="Stack"><button>Search</button></div><nav aria-label="Repository">Repository navigation</nav>';
  const inset = document.createElement("aside");
  inset.className = "unmapped-inset";
  document.body.append(globalNav, inset);
  const profile = document.createElement("section");
  profile.className = "js-yearly-contributions contribution-activity-listing";
  profile.innerHTML =
    [0, 1, 2, 3, 4]
      .map(
        (level) =>
          `<div class="ContributionCalendar-day" data-level="${level}"></div>`,
      )
      .join("") +
    '<svg class="js-activity-overview-graph" width="40" height="40" viewBox="0 0 40 40"><path class="js-highlight-blob" fill="#40c463" stroke="#40c463" opacity="0.5" d="M5 5 L35 5 L20 35 Z"></path><line class="activity-overview-axis" stroke="#40c463" x1="0" y1="20" x2="40" y2="20"></line><ellipse class="activity-overview-point" fill="white" stroke="#40c463" cx="20" cy="20" rx="3" ry="3"></ellipse></svg><div class="Progress" role="img"><span class="Progress-item" style="width:55%;background-color:#30a14e"></span></div><a class="js-year-link selected" aria-current="true">2026</a><a class="js-year-link">2025</a>';
  document.body.append(profile);

  const area = document.createElement("section");
  area.innerHTML =
    '<div class="surface">Surface</div><div class="variable">Variables</div><button class="focus-card">Focus</button><a class="accent">Link</a><div class="alpha">Alpha</div><div data-duxreader-preserve style="background:white;color:black">Preserved inline</div>';
  document.body.append(area);
  const legend = document.createElement("section");
  legend.style.backgroundColor = "white";
  for (const source of ["#f1e05a", "#3178c6", "#dea584"]) {
    for (const className of [
      "repo-language-color",
      "Progress-item",
      "react-progress",
    ]) {
      const swatch = document.createElement("span");
      swatch.className = className;
      if (className === "react-progress")
        swatch.dataset.component = "ProgressBar.Item";
      swatch.style.backgroundColor = source;
      legend.append(swatch);
    }
  }
  document.body.append(legend);
  const languageLink = document.createElement("a");
  languageLink.href = "/owner/repo/search?l=javascript";
  languageLink.innerHTML =
    '<span class="languageDot__arbitraryHash" style="background-color:#f1e05a"></span><span>JavaScript</span>';
  const siteSelectors = getPreservedInlineSelectors(
    new URL("https://github.com/owner/repo"),
  );
  assert(
    siteSelectors.some((selector) =>
      languageLink.firstElementChild!.matches(selector),
    ),
    "GitHub React language dots match through their language-search links",
  );
  assert(
    !siteSelectors.some((selector) =>
      languageLink.lastElementChild!.matches(selector),
    ),
    "The GitHub language rule excludes text labels",
  );
  assert(
    !getPreservedInlineSelectors(
      new URL("https://example.org/owner/repo"),
    ).some((selector) => languageLink.firstElementChild!.matches(selector)),
    "GitHub-specific language structure is scoped to GitHub",
  );
  const unlinkedLanguage = document.createElement("span");
  unlinkedLanguage.className = "languageDot__arbitraryHash";
  unlinkedLanguage.style.backgroundColor = "#f1e05a";
  assert(
    siteSelectors.some((selector) => unlinkedLanguage.matches(selector)),
    "GitHub fork language dots are preserved without search links",
  );

  const searchExample = document.createElement("section");
  searchExample.innerHTML =
    '<ul><li><span><div style="background-color:#dea584"></div></span><span aria-label="Rust language">Rust</span></li></ul><a href="/search?q=rust+language%3ARust&amp;type=repositories"><span data-component="ActionList.LeadingVisual"><div style="background-color:#dea584"></div></span><span>Rust filter</span></a>';
  const searchSelectors = getPreservedInlineSelectors(
    new URL("https://github.com/search?q=rust&type=repositories"),
  );
  const resultDot = searchExample.querySelector("div")!;
  const filterDot = searchExample.querySelector("a div")!;
  assert(
    searchSelectors.some((selector) => resultDot.matches(selector)),
    "Search result language dots match the route rules",
  );
  assert(
    searchSelectors.some((selector) => filterDot.matches(selector)),
    "Search language facets match the route rules",
  );
  assert(
    getPreservedInlineSelectors(new URL("https://github.com/owner/repo")).some(
      (selector) => resultDot.matches(selector),
    ),
    "Search swatches remain protected during same-document GitHub navigation",
  );
  assert(
    !searchSelectors.some((selector) =>
      searchExample
        .querySelector('[aria-label="Rust language"]')!
        .matches(selector),
    ),
    "Search language labels retain ordinary text theming",
  );
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
  renderer.apply(mappedTheme(theme), true);
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
  for (const swatch of legend.children) {
    const element = swatch as HTMLElement;
    assert(
      color(element) === element.style.backgroundColor,
      "Language and progress swatches retain their original data colors",
    );
    assert(
      !element.hasAttribute("data-darkreader-inline-bgcolor"),
      "Semantic swatches do not receive inline color overrides",
    );
  }
  assert(
    color(legend) === rgb(theme.colors.background),
    "Legend containers still follow the desktop theme",
  );
  const dynamicSwatch = legend.firstElementChild as HTMLElement;
  dynamicSwatch.style.backgroundColor = "#ff0000";
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    color(dynamicSwatch) === "rgb(255, 0, 0)",
    "Data color updates retain source colors",
  );
  assert(
    [
      header,
      ...header.querySelectorAll(".AppHeader-globalBar,.AppHeader-localBar"),
    ].every((node) => color(node) === rgb(theme.colors.background)),
    "GitHub header containers use the exact theme background",
  );
  assert(
    color(header.querySelector("button")!) === rgb(theme.colors.surface),
    "Header controls retain their surface colors",
  );
  assert(
    color(globalNav) === rgb(theme.colors.background),
    "Current GlobalNav background shorthand is overridden by the theme background",
  );
  assert(
    color(inset) === rgb(theme.colors.surface),
    "Shared bgColor-inset consumers keep their surface color",
  );
  assert(
    color(globalNav.querySelector("button")!) === rgb(theme.colors.surface),
    "GlobalNav controls are not flattened into the header background",
  );
  const levels = [...profile.querySelectorAll(".ContributionCalendar-day")].map(
    (node) => color(node),
  );
  assert(
    new Set(levels).size === 5,
    "Contribution intensity retains five distinct theme shades",
  );
  assert(
    levels[0] === rgb(theme.colors.surface) &&
      levels[4] === rgb(theme.colors.accent),
    "Calendar intensity uses only theme endpoints",
  );
  assert(
    color(profile.querySelector(".js-highlight-blob")!, "fill") ===
      rgb(theme.colors.accent),
    "Radar fill uses theme accent",
  );
  assert(
    color(profile.querySelector(".activity-overview-axis")!, "stroke") ===
      rgb(theme.colors.accent),
    "Radar axes use theme accent",
  );
  assert(
    profile.querySelector(".js-highlight-blob")!.getAttribute("d") ===
      "M5 5 L35 5 L20 35 Z",
    "Radar geometry remains unchanged",
  );
  assert(
    color(profile.querySelector(".Progress-item")!) ===
      rgb(theme.colors.accent),
    "Repository contribution bars use theme accent",
  );
  assert(
    (profile.querySelector(".Progress-item") as HTMLElement).style.width ===
      "55%",
    "Contribution bar widths remain unchanged",
  );
  let selectedYear = profile.querySelector(".js-year-link.selected")!;
  assert(
    color(selectedYear, "color") === rgb(theme.colors.background),
    "Selected-year text uses a contrasting dark palette color",
  );
  const beforeYearSelection = generatedCSS();
  const nextYear = profile.querySelectorAll(".js-year-link")[1]!;
  selectedYear.classList.remove("selected");
  selectedYear.removeAttribute("aria-current");
  nextYear.classList.add("selected");
  nextYear.setAttribute("aria-current", "true");
  selectedYear = nextYear;
  assert(
    color(selectedYear, "color") === rgb(theme.colors.background),
    "Newly selected years immediately use contrasting theme text",
  );
  assert(
    generatedCSS() === beforeYearSelection,
    "Year selection does not regenerate mapped CSS",
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
  renderer.apply(mappedTheme(replacement), true);
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
  renderer.apply(mappedTheme(light), true);
  await waitFor(() => color(panel) === rgb(light.colors.background));
  assert(
    color(panel, "color") === rgb(light.colors.foreground),
    "Light mode uses the supplied palette",
  );
  assert(
    color(dynamicSwatch) === "rgb(255, 0, 0)",
    "Palette changes preserve semantic data colors",
  );
  assert(
    color(header) === rgb(light.colors.background),
    "Header mappings follow a new light palette",
  );
  assert(
    color(globalNav) === rgb(light.colors.background),
    "GlobalNav mappings update with a light palette",
  );
  assert(
    color(selectedYear, "color") === rgb(light.colors.background),
    "Selected-year text remains readable on a dark light-mode accent",
  );
  renderer.apply(light, false);
  assert(
    CSSStyleSheet.prototype.insertRule === nativeInsert,
    "Disable restores upstream CSSOM hooks",
  );
  assert(
    color(globalNav) === "rgb(21, 27, 35)",
    "Disabling restores the original GlobalNav background variable",
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
  renderer.apply(mappedTheme(theme), true);
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
