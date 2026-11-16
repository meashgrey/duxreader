import { startPicker } from "../../lib/inspector/picker";

declare global {
  interface Window {
    __pickerResult?: { ok: boolean; checks: string[]; error?: string };
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

const pickerRoot = () =>
  document.querySelector<HTMLElement>("[data-duxreader-picker]")!;

const shadow = () => pickerRoot().shadowRoot!;

const boxes = (selector: string) =>
  [...shadow().querySelectorAll<HTMLElement>(selector)].filter(
    (node) => node.style.display !== "none" && !node.classList.contains("hidden"),
  );

async function move(x: number, y: number) {
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }),
  );
  // The family search is intentionally deferred until the pointer settles.
  await new Promise((resolve) => setTimeout(resolve, 120));
  await frame();
}

async function run() {
  document.body.style.cssText = "margin:0;padding:40px;font:16px system-ui";
  document.body.innerHTML = `
    <div id="list">
      ${[1, 2, 3, 4].map((index) => `<div class="cardItem__aB3xY" style="height:60px;margin:10px 0">Card ${index}</div>`).join("")}
    </div>
    <div style="height:1400px"></div>
    <div class="cardItem__aB3xY" id="far-card" style="height:60px">Far card</div>
  `;

  startPicker(document, {
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

  const card = document.querySelector<HTMLElement>("#list .cardItem__aB3xY")!;
  const rect = card.getBoundingClientRect();
  await move(rect.left + 20, rect.top + 20);

  const highlight = boxes(".highlight")[0];
  assert(highlight, "hover paints a highlight box");
  const highlightRect = highlight!.getBoundingClientRect();
  assert(
    Math.abs(highlightRect.left - rect.left) <= 1 &&
      Math.abs(highlightRect.top - rect.top) <= 1,
    "hover highlight follows the picked element",
  );

  const previews = boxes(".match");
  assert(previews.length === 4, "hover previews the whole component family");
  assert(
    previews.every((node) => node !== highlight),
    "family previews are separate boxes",
  );
  const previewRect = previews[0]!.getBoundingClientRect();
  assert(
    previews.some(
      (node) => Math.abs(node.getBoundingClientRect().left - previewRect.left) < 1,
    ),
    "family previews sit on the matched elements",
  );

  const highlightStyle = getComputedStyle(highlight!);
  const previewStyle = getComputedStyle(previews[0]!);
  assert(
    highlightStyle.borderStyle === "solid",
    "the picked element keeps a solid border",
  );
  assert(
    previewStyle.borderStyle === "dashed",
    "family previews use a dashed border",
  );
  assert(
    highlightStyle.borderColor !== previewStyle.borderColor,
    "the two boxes use different colors",
  );
  const labelText = shadow().querySelector(".label")!.textContent ?? "";
  const total = previews.length + 1;
  assert(
    labelText.includes(`${total} matches`),
    `the label announces the family size (got ${JSON.stringify(labelText)})`,
  );

  // Selecting freezes the picker, then scrolling must re-anchor both boxes.
  const clickRect = card.getBoundingClientRect();
  document.dispatchEvent(
    new MouseEvent("click", {
      clientX: clickRect.left + 20,
      clientY: clickRect.top + 20,
      bubbles: true,
      cancelable: true,
    }),
  );
  await frame();
  assert(
    !shadow()
      .querySelector<HTMLElement>(".panel.map")!
      .classList.contains("hidden"),
    "clicking opens the map panel",
  );

  const before = boxes(".highlight")[0]!.getBoundingClientRect().top;
  window.scrollTo(0, 200);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await frame();
  const expected = card.getBoundingClientRect().top;
  const after = boxes(".highlight")[0]!.getBoundingClientRect().top;
  assert(
    Math.abs(before - expected) > 40,
    "scrolling actually moves the page",
  );
  assert(
    Math.abs(after - expected) <= 1,
    "the highlight re-anchors after scrolling",
  );
  const previewTop = boxes(".match")[0]!.getBoundingClientRect().top;
  const previewTarget = document
    .querySelectorAll<HTMLElement>(".cardItem__aB3xY")[1]!
    .getBoundingClientRect().top;
  assert(
    Math.abs(previewTop - previewTarget) <= 1,
    "family previews re-anchor after scrolling",
  );

  // Turning the family scope off must hide every preview box.
  const toggle = shadow().querySelector<HTMLInputElement>(".scope-toggle")!;
  toggle.checked = false;
  toggle.dispatchEvent(new Event("change", { bubbles: true }));
  await frame();
  assert(
    boxes(".match").length === 0,
    "exact scope hides family previews",
  );
}

run()
  .then(() => {
    window.__pickerResult = { ok: true, checks, error: errors[0] };
  })
  .catch((error) => {
    window.__pickerResult = { ok: false, checks, error: String(error) };
  });
