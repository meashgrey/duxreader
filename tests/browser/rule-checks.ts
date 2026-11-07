import type { Theme } from "../../lib/theme";

export async function ruleChecks(
  theme: Theme,
  assert: (condition: boolean, label: string) => void,
  waitFor: (predicate: () => boolean) => Promise<void>,
) {
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const base = rgb(theme.colors.background),
    surface = rgb(theme.colors.surface);
  const source = document.createElement("style");
  source.textContent = `
    @layer compiled-low,compiled-high;
    @layer compiled-low { .compiled-important {background:#eee!important} }
    @layer compiled-high { .compiled-important {background:#fff!important} }
    .compiled-normal {background:#fff}
    .compiled-inline-priority {background:#eee!important}
    :where(.compiled-inline-universal) {background:#eee!important}
    .compiled-state {background:#fff;color:#111}
    .compiled-state:focus {background:#eee}
    .compiled-form {background:#fff}
    .compiled-form:has(input:valid) {background:#eee}
    .compiled-reset {background:#eee}
    .compiled-reset.clear {background:transparent}
    .compiled-nested {background:#fff; &.selected {background:#eee} }
    .compiled-nested-control {background:#fff; &:focus {background:#2563eb;color:white} }
    .compiled-scoped {background:#fff}
    @scope (.compiled-scope) { .compiled-scoped {background:#eee} }
    .compiled-container {container-type:inline-size;width:220px}
    .compiled-contained {background:#fff}
    @container (min-width:200px) { .compiled-contained {background:#eee} }
    @property --compiled-registration {syntax:"<color>";inherits:false;initial-value:#eee}
    .compiled-registered {background:var(--compiled-registration)}
    @keyframes compiled-motion {from{transform:translateX(0);background:#fff}to{transform:translateX(20px);background:#eee}}
    .compiled-animation {animation:compiled-motion 1s linear paused both;animation-delay:-1s}
    .compiled-preserved {background:#fff;color:#111}
  `;
  const host = document.createElement("section");
  host.innerHTML = `<div class="compiled-important">Layered priority</div><div class="compiled-inline-priority" style="background:white">Inline priority</div><div class="compiled-inline-universal" style="background:white">Zero specificity priority</div><button class="compiled-state">Focus</button>
    <div class="compiled-form"><input required pattern="[a-z]{3,}" value=""></div>
    <div class="compiled-reset clear">Reset</div><div class="compiled-nested">Nested</div><button class="compiled-nested-control">Nested control</button>
    <div class="compiled-scope"><div class="compiled-scoped">Inside scope</div></div><div class="compiled-scoped">Outside scope</div>
    <div class="compiled-container"><div class="compiled-contained">Container</div></div>
    <div class="compiled-registered">Registered</div><div class="compiled-animation">Animation</div>
    <div data-duxreader-preserve><div class="compiled-preserved">Preserved</div></div>`;
  document.head.append(source);
  document.body.append(host);
  const imported = document.createElement("style");
  imported.textContent = '@import url("/local-import.css");';
  const importLoaded = new Promise<void>((resolve) => {
    imported.onload = () => resolve();
  });
  document.head.append(imported);
  await importLoaded;
  const importedTarget = document.createElement("div");
  importedTarget.className = "compiled-local-import";
  host.append(importedTarget);
  await waitFor(
    () => getComputedStyle(importedTarget).backgroundColor === surface,
  );
  const importRule = imported.sheet!.cssRules[0] as CSSImportRule;
  (importRule.styleSheet!.cssRules[0] as CSSStyleRule).style.backgroundColor =
    "#fff";
  await waitFor(
    () => getComputedStyle(importedTarget).backgroundColor === base,
  );
  assert(
    true,
    "Readable import CSSOM edits invalidate the parent compilation cache",
  );
  const find = (selector: string) => host.querySelector<HTMLElement>(selector)!;
  const provider = document.createElement("div");
  provider.style.setProperty("--inline-late-tone", "#eee");
  provider.innerHTML =
    '<div class="compiled-late-consumer">Late inline consumer</div>';
  host.append(provider);
  const lateStyle = document.createElement("style");
  lateStyle.textContent =
    ".compiled-late-consumer{background:var(--inline-late-tone)}";
  document.head.append(lateStyle);
  await waitFor(
    () =>
      getComputedStyle(provider.firstElementChild!).backgroundColor === surface,
  );
  assert(
    true,
    "Late color consumers activate previously unused inline variable providers",
  );
  const bg = (selector: string) =>
    getComputedStyle(find(selector)).backgroundColor;
  await waitFor(() => bg(".compiled-important") === surface);
  assert(true, "Precompiled rules retain named-layer important priority");
  assert(
    bg(".compiled-inline-priority") === surface &&
      bg(".compiled-inline-universal") === surface,
    "Source important colors retain priority over normal inline colors",
  );
  await waitFor(() => bg(".compiled-reset") === "rgba(0, 0, 0, 0)");
  assert(true, "Transparent declarations reset preceding palette rules");
  const nested = find(".compiled-nested");
  nested.classList.add("selected");
  assert(
    getComputedStyle(nested).backgroundColor === surface,
    "Nested class selectors change colors natively",
  );
  const nestedControl = find(".compiled-nested-control");
  nestedControl.focus();
  assert(
    getComputedStyle(nestedControl).backgroundColor ===
      rgb(theme.colors.accent) &&
      getComputedStyle(nestedControl).color === base,
    "Nested control rules retain accent and on-accent roles",
  );
  nestedControl.blur();
  if (typeof CSSScopeRule !== "undefined") {
    assert(
      bg(".compiled-scope .compiled-scoped") === surface &&
        bg(":scope > .compiled-scoped") === base,
      "Scope boundaries survive rule compilation",
    );
  }
  assert(
    bg(".compiled-contained") === surface,
    "Container conditions retain palette declarations",
  );
  find(".compiled-container").style.width = "100px";
  assert(
    bg(".compiled-contained") === base,
    "Container resizing switches precompiled colors natively",
  );
  if (typeof CSSPropertyRule !== "undefined") {
    assert(
      bg(".compiled-registered") === surface,
      "Registered variable initial values receive typed palette projections",
    );
  }
  await waitFor(() => bg(".compiled-animation") === surface);
  assert(
    getComputedStyle(find(".compiled-animation")).transform ===
      "matrix(1, 0, 0, 1, 20, 0)",
    "Color keyframe overrides preserve geometry declarations",
  );
  assert(
    bg(".compiled-preserved") === "rgb(255, 255, 255)",
    "Precompiled rules exclude preserved subtrees",
  );
  const button = find(".compiled-state"),
    form = find(".compiled-form"),
    input = host.querySelector<HTMLInputElement>(".compiled-form input")!;
  await new Promise((resolve) => setTimeout(resolve, 100));
  const native = window.getComputedStyle;
  let reads = 0;
  window.getComputedStyle = (...args) => {
    reads++;
    return native.apply(window, args);
  };
  try {
    button.focus();
    assert(
      native.call(window, button).backgroundColor === surface,
      "Focus colors are ready synchronously before a renderer frame",
    );
    button.blur();
    input.value = "valid";
    assert(
      native.call(window, form).backgroundColor === surface,
      "Value-dependent relational colors do not require input notifications",
    );
    for (const type of [
      "pointerover",
      "pointerout",
      "keydown",
      "keyup",
      "input",
      "change",
    ])
      button.dispatchEvent(new Event(type, { bubbles: true }));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  } finally {
    window.getComputedStyle = native;
  }
  assert(
    reads === 0,
    "Focus, pointer, and typing events perform zero renderer computed-style reads",
  );
  source.remove();
  lateStyle.remove();
  imported.remove();
  host.remove();
}
