import { startPicker } from "../../lib/inspector/picker";

declare global {
  interface Window {
    __layersResult?: { ok: boolean; checks: string[]; error?: string };
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

const colors = {
  background: "#111318",
  surface: "#1d2024",
  foreground: "#e1e2e9",
  accent: "#a8c8ff",
};

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const shadow = () =>
  document.querySelector<HTMLElement>("[data-duxreader-picker]")!.shadowRoot!;

const label = () => shadow().querySelector(".label")!.textContent ?? "";
const hint = () => shadow().querySelector(".hint")!.textContent ?? "";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function hover(x: number, y: number) {
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }),
  );
  await wait(120);
  await frame();
}

async function press(key: string) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
  await wait(120);
  await frame();
}

async function click(x: number, y: number) {
  document.dispatchEvent(
    new MouseEvent("click", {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
  await wait(160);
  await frame();
}

async function run() {
  document.body.style.cssText = "margin:0;padding:40px;font:16px system-ui";
  document.body.innerHTML = `
    <table id="cells" style="border-collapse:collapse"><tr>
      <td id="left" style="border:1px solid #888;padding:18px">Left</td>
      <td id="right" style="border:1px solid #888;padding:18px">Right</td>
    </tr></table>
    <div id="outer" style="margin-top:30px;border:1px solid #888;padding:18px">
      Outer
      <div id="middle" style="border:1px solid #888;padding:16px;margin-top:10px">
        Middle
        <div id="inner" style="border:1px solid #888;padding:14px;margin-top:8px">Inner</div>
      </div>
    </div>
  `;

  const saved: Array<{ selector: string; target?: string }> = [];
  let cleanupPicker = startPicker(document, {
    mode: "map",
    colors,
    onPreserve: () => ({
      identityVariants: 1,
      stable: "",
      own: "",
      varying: [],
      saved: false,
    }),
    onMap(selector) {
      saved.push({ selector });
    },
  });
  await frame();

  // 1. Two siblings meeting at a shared border: both are under the cursor.
  const right = document.querySelector<HTMLElement>("#right")!;
  const left = document.querySelector<HTMLElement>("#left")!;
  const rightRect = right.getBoundingClientRect();
  const sharedX = Math.round(rightRect.left);
  await hover(sharedX, rightRect.top + 10);
  assert(
    label().includes("1/"),
    `shared borders expose a layer stack (got ${JSON.stringify(label())})`,
  );
  assert(
    hint().includes("to switch element"),
    "the hint explains how to switch layers",
  );

  // 2. Arrow keys walk outward, then back inward.
  const firstLayer = label();
  await press("ArrowUp");
  const secondLayer = label();
  assert(secondLayer !== firstLayer, "ArrowUp moves to another element");
  assert(
    secondLayer.includes("2/"),
    `ArrowUp advances the layer counter (got ${JSON.stringify(secondLayer)})`,
  );
  await press("ArrowDown");
  assert(label() === firstLayer, "ArrowDown returns to the previous layer");
  await press("ArrowDown");
  assert(
    label() === firstLayer,
    "ArrowDown does not wrap past the innermost element",
  );
  assert(
    secondLayer.includes("#left") || firstLayer.includes("#right"),
    "sibling cells are both reachable",
  );

  // 3. Nested cards: the innermost is picked by default, arrows climb outward.
  const inner = document.querySelector<HTMLElement>("#inner")!;
  const innerRect = inner.getBoundingClientRect();
  await hover(innerRect.left + 40, innerRect.top + 1);
  assert(label().includes("#inner"), "nested hover starts at the inner box");
  await press("ArrowUp");
  assert(
    label().includes("#middle"),
    `ArrowUp climbs to the parent box (got ${JSON.stringify(label())})`,
  );
  await press("ArrowUp");
  assert(
    label().includes("#outer"),
    `ArrowUp keeps climbing (got ${JSON.stringify(label())})`,
  );
  await press("ArrowUp");
  assert(
    label().includes("#outer"),
    "ArrowUp stops at the outermost candidate",
  );

  // 4. A point with only one candidate clears the layer hint again.
  const outerRect = document
    .querySelector<HTMLElement>("#outer")!
    .getBoundingClientRect();
  await hover(outerRect.left + 6, outerRect.top + 6);
  assert(
    !hint().includes("to switch element"),
    "a single-element point clears the layer hint",
  );
  assert(
    label().includes("#outer"),
    `the single-element point picks that box (got ${JSON.stringify(label())})`,
  );

  // 5. Clicking opens the rule for the chosen layer, not the element a plain
  // click would hit.
  await hover(innerRect.left + 40, innerRect.top + 1);
  await press("ArrowUp");
  await press("ArrowUp");
  assert(
    label().includes("#outer"),
    "the pinned layer is restored before saving",
  );
  await click(innerRect.left + 40, innerRect.top + 1);
  const panel = shadow().querySelector<HTMLElement>(".panel.map")!;
  assert(
    !panel.classList.contains("hidden"),
    "clicking the pinned layer opens the map panel",
  );
  const selector =
    panel.querySelector<HTMLElement>(".selector")!.textContent ?? "";
  assert(
    selector === "#outer",
    `the panel targets the stepped layer (got ${JSON.stringify(selector)})`,
  );
  assert(saved.length === 0, "map mode still waits for a theme role");
  // 6. Hovering a large ancestor first must never block its descendants.
  // The ancestor stays in the stack while the cursor is visually inside it, so
  // a sticky layer choice would make small children unreachable.
  cleanupPicker();
  await frame();
  const reachable: string[] = [];
  cleanupPicker = startPicker(document, {
    mode: "map",
    colors,
    onPreserve: () => ({
      identityVariants: 1,
      stable: "",
      own: "",
      varying: [],
      saved: false,
    }),
    onMap(selector) {
      reachable.push(selector);
    },
  });
  await frame();

  const deep = document.querySelector<HTMLElement>("#inner")!;
  const deepRect = deep.getBoundingClientRect();
  const outerRect2 = document
    .querySelector<HTMLElement>("#outer")!
    .getBoundingClientRect();

  // Sweep outward first so the pointer physically enters the ancestor.
  await hover(outerRect2.left + 6, outerRect2.top + 6);
  const ancestorLabel = label();
  assert(
    ancestorLabel.includes("#middle") || ancestorLabel.includes("#outer"),
    `hovering the ancestor selects it first (got ${JSON.stringify(ancestorLabel)})`,
  );

  // Then walk into the smallest child at the centre of the nest.
  await hover(deepRect.left + deepRect.width / 2, deepRect.top + 4);
  assert(
    label().includes("#inner"),
    `a descendant is still reachable after hovering its ancestor (got ${JSON.stringify(label())})`,
  );

  // And it stays reachable when moving back and forth.
  await hover(outerRect2.left + 6, outerRect2.top + 6);
  await hover(deepRect.left + deepRect.width / 2, deepRect.top + 4);
  assert(
    label().includes("#inner"),
    `descendants stay reachable across repeated sweeps (got ${JSON.stringify(label())})`,
  );

  // Deepest-first ordering must still hold at the deep point.
  const deepLayers = label();
  assert(
    deepLayers.includes("#inner") && deepLayers.includes("1/"),
    `the innermost element is layer 1 at a nested point (got ${JSON.stringify(deepLayers)})`,
  );
  // 7. Hovering must settle on one box. An element that resolves to an
  // ancestor (a wrapper or an interactive parent) used to be compared against
  // the resolved target, so every 1px jiggle restarted the resolution and the
  // highlight flickered between the small element and the ancestor.
  cleanupPicker();
  await frame();
  document.body.innerHTML = `
    <div id="flicker-scope" style="padding:20px">
      <span class="badgeWrapper" style="display:inline-block;padding:4px"><span class="css-1a2b3c" style="display:inline-block;padding:6px">badge</span></span>
    </div>
  `;
  cleanupPicker = startPicker(document, {
    mode: "map",
    colors,
    onPreserve: () => ({
      identityVariants: 1,
      stable: "",
      own: "",
      varying: [],
      saved: false,
    }),
    onMap: () => {},
  });
  await frame();

  const weak = document.querySelector<HTMLElement>(".css-1a2b3c")!;
  const weakRect = weak.getBoundingClientRect();
  await hover(
    weakRect.left + weakRect.width / 2,
    weakRect.top + weakRect.height / 2,
  );

  // Sample the painted box while jiggling the pointer inside the element.
  const sizes: string[] = [];
  const highlightBox = () => {
    const node = shadow().querySelector<HTMLElement>(".highlight");
    if (!node || node.classList.contains("hidden")) return "hidden";
    const rect = node.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  };
  for (let index = 0; index < 10; index++) {
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: weakRect.left + weakRect.width / 2 + (index % 2),
        clientY: weakRect.top + weakRect.height / 2,
        bubbles: true,
      }),
    );
    await wait(20);
    sizes.push(highlightBox());
    await wait(90);
    sizes.push(highlightBox());
  }
  const stable = [...new Set(sizes.filter((size) => size !== "hidden"))];
  assert(
    stable.length === 1,
    `hovering settles on a single box instead of flickering (saw ${JSON.stringify(stable)})`,
  );

  // Labels display only tag/id; verify the stored selector against the DOM.
  await click(
    weakRect.left + weakRect.width / 2,
    weakRect.top + weakRect.height / 2,
  );
  const wrapperSelector = shadow().querySelector(
    ".panel.map .selector",
  )!.textContent!;
  assert(
    document.querySelector(wrapperSelector) ===
      document.querySelector(".badgeWrapper"),
    "the saved wrapper selector identifies the wrapper, not its inner span",
  );

  cleanupPicker();
  document.body.innerHTML =
    '<button class="iconControl" style="width:240px;height:100px"><span class="css-1a2b3c" style="display:inline-block;width:12px;height:12px">x</span></button>';
  cleanupPicker = startPicker(document, {
    mode: "map",
    colors,
    onPreserve: () => ({
      identityVariants: 1,
      stable: "",
      own: "",
      varying: [],
      saved: false,
    }),
    onMap: () => {},
  });
  const icon = document.querySelector<HTMLElement>(".css-1a2b3c")!;
  const iconRect = icon.getBoundingClientRect();
  const x = iconRect.left + iconRect.width / 2,
    y = iconRect.top + iconRect.height / 2;
  await hover(x, y);
  assert(
    label().startsWith("button "),
    "weak icons resolve to their interactive control by default",
  );
  await press("ArrowUp");
  await press("ArrowDown");
  await click(x, y);
  const iconSelector = shadow().querySelector(
    ".panel.map .selector",
  )!.textContent!;
  assert(
    document.querySelector(iconSelector) === icon,
    "explicit layer selection can still map the small icon itself",
  );
  cleanupPicker();
}

run()
  .then(() => {
    window.__layersResult = { ok: true, checks, error: errors[0] };
  })
  .catch((error) => {
    window.__layersResult = { ok: false, checks, error: String(error) };
  });
