import {
  captureColorDeclarations,
  familySelector,
  resolvePickerTarget,
  selectorFor,
} from "../../lib/inspector/selector";

declare global {
  interface Window {
    __inspectorResult?: { ok: boolean; checks: string[]; error?: string };
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

function run() {
  document.body.innerHTML = `
    <ul class="list list__2Xy9Qa" id="issue-list">
      <li class="listItem__X41oTe"><span class="prc-Token-TokenBase-te5-F prc-Token-IssueLabel-2IazM IssueLabelToken__0H-m6r" style="color:rgb(1, 2, 3)"><span class="prc-Text-Text-9mHv3">bug</span></span></li>
      <li class="listItem__X41oTe"><span class="prc-Token-TokenBase-te5-F prc-Token-IssueLabel-2IazM IssueLabelToken__0H-m6r" style="color:rgb(4, 5, 6)">docs</span></li>
      <li class="listItem__X41oTe selected"><span class="prc-Token-TokenBase-te5-F prc-Token-IssueLabel-2IazM IssueLabelToken__0H-m6r" style="color:rgb(7, 8, 9)">ui</span></li>
    </ul>
    <div class="prc-IssueLabel-IssueLabel-tPs7V" data-variant="cyan">variant label</div>
    <div id="panel">panel</div>
    <div class="css-1a2b3c"><span class="css-9z8y7x">generated only</span></div>
    <section data-testid="settings-panel">
      <button data-testid="settings-save">Save</button>
      <button data-testid="row-1234">Row</button>
    </section>
    <section id="products">
      <article data-component="product-card">
        <div><a href="/desktop" data-slot="media" data-product="desktop" aria-label="Desktop"></a></div>
        <h3><a href="/desktop">Desktop</a></h3>
        <div><a href="https://example.com/desktop/linux.deb" data-slot="store" role="menuitem">Linux</a></div>
      </article>
      <article data-component="product-card">
        <div><a href="/terminal" data-slot="media" data-product="terminal" aria-label="Terminal"></a></div>
        <h3><a href="/terminal">Terminal</a></h3>
        <div><a href="https://example.com/terminal/mac.dmg" data-slot="store" role="menuitem">macOS</a></div>
      </article>
      <article data-component="product-card">
        <div><a href="/mobile" data-slot="media" data-product="mobile" aria-label="Mobile"></a></div>
        <h3><a href="/mobile">Mobile</a></h3>
      </article>
      <article data-component="product-card">
        <div><a href="/sdk" data-slot="media" data-product="sdk" aria-label="SDK"></a></div>
        <h3><a href="/sdk">SDK</a></h3>
      </article>
    </section>
    <nav id="docs">
      <a href="/docs/intro">Intro</a><a href="/docs/api">API</a><a href="/blog">Blog</a>
    </nav>
  `;

  const label = document.querySelector('[class*="prc-Token-IssueLabel"]')!;
  const labels = familySelector(label);
  assert(labels.kind === "class", "labels use a class family");
  assert(
    labels.selector === '[class*="prc-Token-IssueLabel"]',
    "labels collapse to the stable component prefix",
  );
  assert(!labels.selector.includes("2IazM"), "labels drop the hash suffix");
  assert(!labels.selector.includes("nth-of-type"), "labels avoid item paths");
  assert(labels.matches.length === 3, "labels match every issue label");
  assert(
    !labels.matches.some((node) => node.hasAttribute("data-variant")),
    "labels exclude differently named token variants",
  );
  assert(labels.exact !== labels.selector, "labels keep a unique fallback");
  const colors = new Set(labels.matches.map(captureColorDeclarations));
  assert(colors.size === 3, "labels expose their distinct native colors");

  const inner = label.querySelector(".prc-Text-Text-9mHv3")!;
  const innerFamily = familySelector(inner);
  assert(
    innerFamily.quality === 0 && innerFamily.matches.length === 1,
    "typography spans alone are a weak family",
  );
  const resolved = resolvePickerTarget(inner);
  assert(resolved.element === label, "clicks resolve to the label component");
  assert(
    resolved.selection.selector === labels.selector,
    "resolved clicks keep the component selector",
  );

  const control = document.createElement("button");
  control.className = "testIconControl";
  control.style.cssText = "width:240px;height:100px";
  control.innerHTML =
    '<span class="css-1a2b3c" style="display:inline-block;width:12px;height:12px">x</span>';
  document.body.append(control);
  const icon = control.firstElementChild!;
  assert(
    resolvePickerTarget(icon).element === control,
    "small weak icons resolve to interactive controls regardless of area",
  );
  icon.id = "meaningful-icon";
  assert(
    resolvePickerTarget(icon).element === icon,
    "a child with its own meaningful identity remains directly selectable",
  );
  control.remove();

  const item = document.querySelector("li")!;
  const items = familySelector(item);
  assert(items.kind === "class", "list items use a class family");
  assert(items.selector === '[class*="listItem"]', "list items drop the hash");
  assert(items.matches.length === 3, "list items include the selected row");
  assert(
    items.matches.some((node) => node.classList.contains("selected")),
    "state classes do not split the family",
  );

  const panel = familySelector(document.querySelector("#panel")!);
  assert(panel.selector === "#panel", "meaningful ids stay exact");
  assert(panel.matches.length === 1, "an id still selects one node");

  const save = familySelector(
    document.querySelector('[data-testid="settings-save"]')!,
  );
  assert(
    save.selector === '[data-testid="settings-save"]',
    "test ids outrank generated classes",
  );

  const row = familySelector(
    document.querySelector('[data-testid="row-1234"]')!,
  );
  assert(
    !row.selector.includes("row-1234"),
    "instance-specific test ids are ignored",
  );

  const media = document.querySelector('[data-slot="media"]')!;
  const mediaFamily = familySelector(media);
  assert(
    mediaFamily.selector.includes("data-slot"),
    "component data attributes name the family",
  );
  assert(
    mediaFamily.matches.length === 4,
    "media links generalize across product cards",
  );
  assert(
    !mediaFamily.matches.some((node) => node.localName !== "a"),
    "media links keep their element type",
  );

  const heading = familySelector(
    document.querySelector("#products article h3 a")!,
  );
  assert(
    heading.selector === "h3 > a" && !heading.selector.includes("nth-of-type"),
    "classless heading links use a structural family",
  );
  assert(
    heading.matches.length === 4,
    "structural families span product cards",
  );

  const docs = familySelector(document.querySelector("#docs a")!);
  assert(
    docs.selector === 'a[href^="/docs/"]',
    "href prefixes group sibling routes",
  );
  assert(docs.matches.length === 2, "href prefixes exclude unrelated routes");

  const generated = document.querySelector(".css-9z8y7x")!;
  const generatedFamily = familySelector(generated);
  assert(
    generatedFamily.kind === "scoped" &&
      !generatedFamily.selector.includes("css-9z8y7x"),
    "generated-only classes fall back to a structural path",
  );
  const generatedSelector = selectorFor(generated);
  assert(
    document.querySelectorAll(generatedSelector).length === 1,
    "the exact fallback still selects one node",
  );
}

try {
  run();
  window.__inspectorResult = { ok: true, checks, error: errors[0] };
} catch (error) {
  window.__inspectorResult = { ok: false, checks, error: String(error) };
}
