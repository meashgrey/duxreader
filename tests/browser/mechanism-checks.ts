import type { Theme } from "../../lib/theme";
import {
  CSSOM_CHANGED,
  CSSOM_DISABLE,
  CSSOM_ENABLE,
} from "../../lib/rendering/cssom-proxy";

export async function mechanismChecks(
  theme: Theme,
  assert: (condition: boolean, label: string) => void,
  waitFor: (predicate: () => boolean) => Promise<void>,
  readURLs: ReadonlySet<string>,
) {
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const bg = (element: Element, pseudo?: string) =>
    getComputedStyle(element, pseudo).backgroundColor;
  const base = rgb(theme.colors.background),
    surface = rgb(theme.colors.surface),
    accent = rgb(theme.colors.accent);
  const source = document.createElement("style");
  source.textContent = `
    :root { --mechanism-tone:#eee; --mechanism-alias:var(--mechanism-tone, #fff); }
    .mechanism { padding:8px; margin:8px; border:1px solid #999; border-radius:8px; color:#111; }
    .variable-card { background:var(--mechanism-alias); }
    .focus-card { background:#fff; }
    .focus-card:focus { background:#eee; }
    .focus-card:focus::before { content:"Focused"; display:inline-block; background:#eee; color:#111; }
    .state-control { background:#fff; color:black; }
    .state-control:focus { background:#2563eb; color:white; }
    .checked-surface { background:#fff; }
    .checked-toggle:checked + .checked-surface { background:#eee; }
    .relational:has(input:checked) .relational-card { background:#eee; }
    .relational-card { background:#fff; }
    .pseudo-card::after { content:"Pseudo"; background:#eee; color:#111; }
    .effects-card { background:linear-gradient(30deg,#fff 10%,#ccc 80%); box-shadow:0 2px 4px #888; }
    .modern-card { background:oklch(0.85 .01 120); color:color(srgb .08 .08 .08); }
    .p3-card { background:color(display-p3 .9 .9 .9); }
    .modern-gradient { background:linear-gradient(oklch(1 0 0), oklch(.75 0 0)); }
    .style-outside { background:#fff; }
    .style-relation:has(.style-trigger[style]) .style-outside { background:#eee; }
    .empty-surface { background:#fff; }
    .empty-surface:empty { background:#eee; }
    .order-list > .order-item { background:#fff; }
    .order-list > .order-item:nth-child(even) { background:#eee; }
    .media-card { background:#fff; }
    @media (min-width:1px) { .media-card { background:#eee; } }
  `;
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="mechanism variable-card">Variable alias</div>
    <div class="mechanism focus-card" tabindex="0">Focus and pseudo</div>
    <button class="state-control"><span>State control</span></button>
    <input class="checked-toggle" type="checkbox" aria-label="State toggle"><div class="mechanism checked-surface">Checked sibling</div>
    <div class="relational"><input type="checkbox" aria-label="Relational toggle"><div class="mechanism relational-card">Relational target</div></div>
    <div class="mechanism pseudo-card">Pseudo surface</div>
    <div class="mechanism effects-card">Effects</div>
    <div class="mechanism media-card">Conditional surface</div>
    <div class="mechanism modern-card">Oklch surface</div>
    <div class="mechanism p3-card">Display P3 surface</div>
    <div class="mechanism modern-gradient">Oklch gradient</div>
    <div class="mechanism empty-surface"></div>
    <div class="style-relation"><div><span class="style-trigger">Trigger</span></div><div class="mechanism style-outside">Outside target</div></div>
    <div class="order-list"><div class="mechanism order-item">First</div><div class="mechanism order-item">Second</div></div>
  `;
  document.head.append(source);
  document.body.append(container);
  const find = (selector: string) =>
    container.querySelector<HTMLElement>(selector)!;
  const variable = find(".variable-card"),
    focus = find(".focus-card"),
    button = find(".state-control");
  let notifications = 0;
  const notified = () => notifications++;
  document.addEventListener(CSSOM_CHANGED, notified);
  await waitFor(() => bg(variable) === surface);
  const rootRule = source.sheet!.cssRules[0] as CSSStyleRule;
  rootRule.style.setProperty("--mechanism-tone", "#fff");
  await waitFor(() => bg(variable) === base);
  assert(
    notifications > 0,
    "CSS variable CSSOM edits emit page-world invalidation signals",
  );
  assert(
    true,
    "Variable aliases update without DOM mutations or rule-count changes",
  );
  rootRule.style.setProperty("--mechanism-tone", "#eee");
  await waitFor(() => bg(variable) === surface);
  assert(
    true,
    "Alias consumers retain their roles through repeated variable changes",
  );

  focus.focus();
  await waitFor(
    () => bg(focus) === surface && bg(focus, "::before") === surface,
  );
  assert(
    getComputedStyle(focus, "::before").color === rgb(theme.colors.foreground),
    "Focus-generated pseudo-elements use exact palette colors",
  );
  focus.blur();
  await waitFor(
    () => bg(focus) === base && !focus.hasAttribute("data-duxreader-before-bg"),
  );
  assert(true, "Leaving a state removes obsolete pseudo-element overrides");
  button.focus();
  await waitFor(() => bg(button) === accent);
  assert(
    getComputedStyle(button.firstElementChild!).color === base,
    "Focused controls update nested on-accent text",
  );
  button.blur();
  await waitFor(() => bg(button) === base);
  assert(
    getComputedStyle(button.firstElementChild!).color ===
      rgb(theme.colors.foreground),
    "Leaving accent state restores nested foreground roles",
  );
  const checkbox = find(".checked-toggle") as HTMLInputElement;
  checkbox.click();
  await waitFor(() => bg(find(".checked-surface")) === surface);
  checkbox.click();
  await waitFor(() => bg(find(".checked-surface")) === base);
  assert(true, "Checked state updates and restores sibling selectors");
  const relational = find(".relational input") as HTMLInputElement;
  relational.click();
  await waitFor(() => bg(find(".relational-card")) === surface);
  relational.click();
  await waitFor(() => bg(find(".relational-card")) === base);
  assert(true, "Relational :has selectors update on form state changes");
  await waitFor(() => bg(find(".pseudo-card"), "::after") === surface);
  assert(
    getComputedStyle(find(".pseudo-card"), "::after").color ===
      rgb(theme.colors.foreground),
    "Static pseudo-elements use the desktop foreground",
  );
  await waitFor(() =>
    getComputedStyle(find(".effects-card")).backgroundImage.includes(base),
  );
  assert(
    getComputedStyle(find(".effects-card")).backgroundImage.includes(surface),
    "Gradients retain their stops and use palette colors",
  );
  assert(
    getComputedStyle(find(".effects-card")).boxShadow.includes(surface),
    "Neutral shadows use the supplied palette border color",
  );
  await waitFor(() => bg(find(".media-card")) === surface);
  source.media = "not all";
  await waitFor(() => bg(find(".media-card")) !== surface);
  source.media = "all";
  await waitFor(() => bg(find(".media-card")) === surface);
  assert(true, "Conditional stylesheet changes restore active color roles");

  await waitFor(
    () =>
      bg(find(".modern-card")) === surface && bg(find(".p3-card")) === surface,
  );
  assert(
    getComputedStyle(find(".modern-card")).color ===
      rgb(theme.colors.foreground),
    "Oklch and Display P3 source colors map to exact palette roles",
  );
  find(".modern-card").style.backgroundColor = "oklch(1 0 0)";
  await waitFor(() => bg(find(".modern-card")) === base);
  assert(true, "Modern color syntax stays dynamic through inline edits");
  await waitFor(() =>
    getComputedStyle(find(".modern-gradient")).backgroundImage.includes(base),
  );
  assert(
    getComputedStyle(find(".modern-gradient")).backgroundImage.includes(
      surface,
    ),
    "Modern gradient colors retain palette membership",
  );

  const trigger = find(".style-trigger"),
    outside = find(".style-outside");
  trigger.style.color = "#111";
  await waitFor(() => bg(outside) === surface);
  trigger.removeAttribute("style");
  await waitFor(() => bg(outside) === base);
  assert(
    true,
    "Style attribute relations invalidate consumers outside the local subtree",
  );
  const empty = find(".empty-surface");
  await waitFor(() => bg(empty) === surface);
  empty.textContent = "Nonempty";
  await waitFor(() => bg(empty) === base);
  empty.firstChild!.nodeValue = "Other content";
  empty.textContent = "";
  await waitFor(() => bg(empty) === surface);
  assert(true, "Text optimization preserves :empty transitions");
  const list = find(".order-list"),
    first = list.firstElementChild!,
    second = list.lastElementChild!;
  await waitFor(() => bg(second) === surface);
  const inserted = document.createElement("div");
  inserted.className = "mechanism order-item";
  inserted.textContent = "Inserted";
  list.prepend(inserted);
  await waitFor(() => bg(first) === surface && bg(second) === base);
  inserted.remove();
  await waitFor(() => bg(first) === base && bg(second) === surface);
  assert(
    true,
    "Incremental insertion and removal preserve positional selectors",
  );

  const host = document.createElement("div");
  document.body.append(host);
  // Let the host be scanned before attaching a root without a light-DOM edit.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = '<p class="adopted-card">Constructable stylesheet</p>';
  const adopted = new CSSStyleSheet();
  adopted.replaceSync(
    ".adopted-card{background:#eee;color:#111;border:1px solid #999;border-radius:8px}",
  );
  shadow.adoptedStyleSheets = [adopted];
  const shadowCard = shadow.querySelector("p")!;
  await waitFor(() => bg(shadowCard) === surface);
  assert(
    getComputedStyle(shadowCard).color === rgb(theme.colors.foreground),
    "Late shadow roots and adopted stylesheets are discovered",
  );
  adopted.replaceSync(
    ".adopted-card{background:white;color:#111;border-radius:8px}",
  );
  await waitFor(() => bg(shadowCard) === base);
  assert(
    true,
    "Constructable stylesheet replacement updates the shadow palette",
  );
  const adoptedRule = adopted.cssRules[0] as CSSStyleRule;
  adoptedRule.style.backgroundColor = "#eee";
  await waitFor(() => bg(shadowCard) === surface);
  assert(true, "Named CSS declaration setters invalidate adopted stylesheets");
  const extra = new CSSStyleSheet();
  extra.replaceSync(".adopted-card{background:#fff}");
  shadow.adoptedStyleSheets.push(extra);
  await waitFor(() => bg(shadowCard) === base);
  assert(
    true,
    "In-place adopted stylesheet array edits have a polling fallback",
  );
  const moving = document.createElement("div");
  moving.style.cssText =
    "background-image:linear-gradient(#fff,#ccc);color:#111";
  moving.textContent = "Moved gradient";
  container.append(moving);
  await waitFor(() => getComputedStyle(moving).backgroundImage.includes(base));
  const movingID = moving.getAttribute("data-duxreader-node")!;
  shadow.append(moving);
  await waitFor(
    () =>
      getComputedStyle(moving).backgroundImage.includes(base) &&
      !!shadow
        .querySelector('[data-duxreader-sheet="effects"]')
        ?.textContent?.includes(movingID),
  );
  container.append(moving);
  await waitFor(
    () =>
      getComputedStyle(moving).backgroundImage.includes(base) &&
      !shadow
        .querySelector('[data-duxreader-sheet="effects"]')
        ?.textContent?.includes(movingID),
  );
  assert(
    true,
    "Moving effect consumers between roots transfers overrides without stale rules",
  );
  host.remove();
  await waitFor(() => !shadow.querySelector("[data-duxreader-sheet]"));
  assert(
    !shadowCard.hasAttribute("data-duxreader-bg"),
    "Detached shadow trees release overrides and annotations",
  );

  const origin = document.querySelector<HTMLMetaElement>(
    '[name="duxreader-test-css-origin"]',
  )!.content;
  const remote = document.createElement("link");
  remote.rel = "stylesheet";
  remote.href = `${origin}/remote.css`;
  const loaded = new Promise<void>((resolve, reject) => {
    remote.onload = () => resolve();
    remote.onerror = () =>
      reject(new Error("Remote stylesheet failed to load"));
  });
  const remoteContent = document.createElement("div");
  remoteContent.innerHTML =
    '<div class="remote-card" tabindex="0">Remote state</div><div class="remote-variable">Remote variable</div>';
  document.head.append(remote);
  document.body.append(remoteContent);
  await loaded;
  let blocked = false;
  try {
    void remote.sheet!.cssRules;
  } catch {
    blocked = true;
  }
  assert(
    blocked,
    "Cross-origin regression uses a stylesheet inaccessible through page CSSOM",
  );
  await waitFor(() => readURLs.has(`${origin}/remote-palette.css`));
  assert(
    readURLs.has(`${origin}/remote-import.css`),
    "Cross-origin stylesheet imports are indexed recursively",
  );
  const remoteCard = remoteContent.querySelector<HTMLElement>(".remote-card")!,
    remoteVariable = remoteContent.querySelector(".remote-variable")!;
  await waitFor(() => bg(remoteVariable) === surface);
  remoteCard.focus();
  await waitFor(
    () => bg(remoteCard) === surface && bg(remoteCard, "::before") === surface,
  );
  assert(
    true,
    "Remote state selectors and pseudo-elements follow the desktop palette",
  );
  remoteCard.blur();
  await waitFor(() => bg(remoteCard) === base);
  document.documentElement.style.setProperty("--remote-tone", "#fff");
  await waitFor(() => bg(remoteVariable) === base);
  document.documentElement.style.removeProperty("--remote-tone");
  await waitFor(() => bg(remoteVariable) === surface);
  assert(
    true,
    "Variables defined through cross-origin imports track inline overrides",
  );
  const unavailable = document.createElement("link");
  unavailable.rel = "stylesheet";
  unavailable.href = `${origin}/unavailable-index.css`;
  const unavailableLoaded = new Promise<void>((resolve) => {
    unavailable.onload = () => resolve();
  });
  const fallbackContent = document.createElement("div");
  fallbackContent.className = "unreadable-parent";
  fallbackContent.innerHTML =
    '<input aria-label="Fallback focus"><div class="unreadable-child">Fallback consumer</div>';
  document.head.append(unavailable);
  document.body.append(fallbackContent);
  await unavailableLoaded;
  const fallbackCard = fallbackContent.querySelector("div")!;
  await waitFor(() => bg(fallbackCard) === base);
  fallbackContent.querySelector("input")!.focus();
  await waitFor(() => bg(fallbackCard) === surface);
  assert(
    true,
    "Unreadable stylesheet failures retain computed-style state fallback",
  );
  remote.remove();
  unavailable.remove();
  remoteContent.remove();
  fallbackContent.remove();

  // Disable the notification helper to exercise the independent fallback.
  document.dispatchEvent(new Event(CSSOM_DISABLE));
  const before = notifications;
  const fallbackRoot = source.sheet!.cssRules[0] as CSSStyleRule;
  fallbackRoot.style.setProperty("--mechanism-tone", "#fff");
  await waitFor(() => bg(variable) === base);
  assert(
    notifications === before,
    "Full CSSOM fingerprints handle edits when the proxy is unavailable",
  );
  document.dispatchEvent(new Event(CSSOM_ENABLE));
  document.removeEventListener(CSSOM_CHANGED, notified);
  source.remove();
  container.remove();
}
