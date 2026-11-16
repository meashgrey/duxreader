import { startPicker } from "../../lib/inspector/picker";
import { describeColorFamily } from "../../lib/inspector/selector";

declare global {
  interface Window {
    __preserveResult?: { ok: boolean; checks: string[]; error?: string };
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

const panelText = () => {
  const panel = shadow().querySelector<HTMLElement>(".panel.preserve")!;
  return panel.classList.contains("hidden") ? "" : panel.innerText;
};

const visibleButtons = () =>
  [...shadow().querySelectorAll<HTMLButtonElement>(".panel.preserve button")]
    .filter((button) => !button.classList.contains("hidden"))
    .map((button) => button.textContent ?? "");

const click = (element: Element) => {
  const rect = element.getBoundingClientRect();
  document.dispatchEvent(
    new MouseEvent("click", {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + Math.min(rect.height / 2, 8),
      bubbles: true,
      cancelable: true,
    }),
  );
};

interface Written {
  selector: string;
  declarations: string;
}

async function run() {
  const written: Written[] = [];
  document.body.style.cssText = "margin:0;padding:40px;font:16px system-ui";
  document.body.innerHTML = `
    <table id="rows" style="border-collapse:collapse">
      ${[1, 2, 3].map((index) => `<tr><td class="rowCell" style="padding:8px;color:rgb(20, 30, 40);border-top:${index === 1 ? "none" : "1px solid rgb(200, 210, 220)"}">Row ${index}</td></tr>`).join("")}
    </table>
    <div id="badges" style="margin-top:24px">
      ${[
        ["rgb(1, 2, 3)", "one"],
        ["rgb(4, 5, 6)", "two"],
        ["rgb(7, 8, 9)", "three"],
      ]
        .map(
          ([color, text]) =>
            `<span class="badge" style="display:inline-block;padding:8px 12px;color:${color};background:color-mix(in srgb, ${color} 20%, transparent)">${text}</span>`,
        )
        .join("")}
    </div>
  `;

  startPicker(document, {
    mode: "preserve",
    colors,
    onPreserve(request) {
      const family = describeColorFamily(request.element, request.matches);
      if (!request.commit)
        return {
          identityVariants: family.identityVariants,
          stable: family.stable,
          own: family.own,
          varying: family.varying,
          saved: false,
        };
      if (request.variant === "each") {
        for (const match of request.matches) {
          const own = describeColorFamily(match, [match]).own;
          written.push({ selector: request.selector, declarations: own });
        }
      } else {
        written.push({
          selector: request.selector,
          declarations:
            request.variant === "own" ? family.own : family.stable,
        });
      }
      return {
        identityVariants: family.identityVariants,
        stable: family.stable,
        own: family.own,
        varying: family.varying,
        saved: true,
      };
    },
    onMap: () => {},
  });
  await frame();

  // Rows share text and background but differ in a structural divider. That
  // difference must not block preserving the shared colors.
  click(document.querySelector("#rows .rowCell")!);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await frame();
  assert(
    panelText() === "",
    "families with only structural differences save without a window",
  );
  assert(written.length === 1, "one shared rule is written");
  const shared = written[0]!;
  assert(
    shared.selector.includes("rowCell"),
    "the shared rule keeps the component selector",
  );
  assert(
    shared.declarations.includes("color:rgb(20, 30, 40)"),
    "the shared rule keeps the common text color",
  );
  assert(
    !shared.declarations.includes("border-top-color"),
    "the divider difference stays out of the shared rule",
  );

  // Badges have genuinely different colors, so the picker must offer a choice
  // instead of freezing them all to one snapshot.
  written.length = 0;
  click(document.querySelector("#badges .badge")!);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await frame();
  const text = panelText();
  assert(text.length > 0, "mixed families open the preserve panel");
  assert(
    text.includes("3 different color sets"),
    "the panel explains why a shared snapshot would break",
  );
  const buttons = visibleButtons();
  assert(
    buttons.some((label) => label.includes("Preserve each")),
    "the panel offers per-element preservation",
  );
  assert(
    buttons.some((label) => label.includes("Only this element")),
    "the panel still offers the single-element option",
  );

  const each = shadow().querySelector<HTMLButtonElement>(".preserve-each")!;
  each.click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await frame();
  assert(written.length === 3, "per-element preservation writes every match");
  assert(
    written.every((entry) => entry.declarations.includes("color:rgb(")),
    "each written rule keeps its own text color",
  );
  const distinct = new Set(
    written.map((entry) => entry.declarations.match(/color:rgb\([^)]+\)/)![0]),
  );
  assert(distinct.size === 3, "the per-element rules keep distinct colors");
}

run()
  .then(() => {
    window.__preserveResult = { ok: true, checks, error: errors[0] };
  })
  .catch((error) => {
    window.__preserveResult = { ok: false, checks, error: String(error) };
  });
