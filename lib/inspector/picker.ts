import type { Theme } from "../theme";
import {
  resolvePickerTarget,
  type FamilySelection,
} from "./selector";
import type { UserRuleProperty, UserRuleTarget } from "./rules";

export type PickerMode = "preserve" | "map";

export interface PreserveRequest {
  element: Element;
  selector: string;
  matches: readonly Element[];
  /** Measure native colors first; only the commit call writes storage. */
  commit: boolean;
}

export interface PreserveResult {
  /** Distinct native color sets across the matched elements. */
  variants: number;
  declarations: string;
  saved: boolean;
}

export interface PickerCallbacks {
  onPreserve(
    request: PreserveRequest,
  ): Promise<PreserveResult> | PreserveResult;
  onMap(
    selector: string,
    property: UserRuleProperty,
    target: UserRuleTarget,
  ): Promise<void> | void;
}

export interface PickerOptions extends PickerCallbacks {
  mode: PickerMode;
  colors: Theme["colors"];
}

const propertyLabels: Record<UserRuleProperty, string> = {
  "background-color": "Background",
  color: "Text",
  "border-color": "Border",
  fill: "Fill",
  stroke: "Stroke",
};

const elementCount = (count: number) =>
  count === 1 ? "this element" : `${count} matching elements`;

export function startPicker(doc: Document, options: PickerOptions): () => void {
  const { colors } = options;
  const host = doc.createElement("div");
  host.dataset.duxreaderPicker = "";
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  // Dark Reader manages stylesheets inside open shadow roots and would copy
  // its transformed colors over the picker. The class opts this sheet out.
  shadow.innerHTML = `
    <style class="darkreader">
      :host { all: initial; }
      .highlight {
        position: fixed;
        pointer-events: none;
        border: 2px solid ${colors.accent};
        background: color-mix(in srgb, ${colors.accent} 14%, transparent);
        border-radius: 4px;
        z-index: 2;
      }
      .label {
        position: fixed;
        max-width: min(420px, calc(100vw - 24px));
        overflow: hidden;
        padding: 4px 8px;
        border-radius: 6px;
        background: ${colors.surface};
        color: ${colors.foreground};
        border: 1px solid ${colors.accent};
        font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace;
        text-overflow: ellipsis;
        white-space: nowrap;
        z-index: 3;
      }
      .panel {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 280px;
        box-sizing: border-box;
        padding: 16px;
        border: 1px solid ${colors.accent};
        border-radius: 16px;
        background: ${colors.surface};
        color: ${colors.foreground};
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        font: 14px/20px system-ui, sans-serif;
        cursor: default;
        pointer-events: auto;
        z-index: 4;
      }
      .panel h2 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
      }
      .panel p {
        margin: 0 0 12px;
        color: ${colors.foreground};
        font-size: 12px;
        opacity: 0.75;
        overflow-wrap: anywhere;
      }
      .panel p.warning {
        color: ${colors.accent};
        opacity: 1;
      }
      .panel label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        opacity: 0.8;
      }
      .scope-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.85;
      }
      .scope-row input {
        margin: 0;
        accent-color: ${colors.accent};
      }
      select {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 12px;
        padding: 8px;
        border: 1px solid ${colors.accent};
        border-radius: 8px;
        background: ${colors.background};
        color: ${colors.foreground};
        font: inherit;
      }
      .swatches {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .swatch, .cancel, .action {
        min-height: 40px;
        border: 1px solid ${colors.accent};
        border-radius: 10px;
        background: ${colors.background};
        color: ${colors.foreground};
        font: inherit;
        cursor: pointer;
      }
      .swatch {
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        padding: 6px 8px;
      }
      .swatch i {
        width: 16px;
        height: 16px;
        flex: none;
        border-radius: 999px;
        border: 1px solid ${colors.foreground};
      }
      .swatch:hover, .cancel:hover, .action:hover {
        background: color-mix(in srgb, ${colors.accent} 18%, ${colors.background});
      }
      .cancel, .action {
        width: 100%;
        margin-top: 8px;
      }
      .toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        padding: 8px 16px;
        border-radius: 999px;
        background: ${colors.foreground};
        color: ${colors.background};
        font: 13px/20px system-ui, sans-serif;
        z-index: 5;
      }
      .hint {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 14px;
        border-radius: 999px;
        background: ${colors.foreground};
        color: ${colors.background};
        font: 12px/18px system-ui, sans-serif;
        white-space: nowrap;
        z-index: 4;
      }
      .hidden { display: none; }
    </style>
    <div class="hint">${
      options.mode === "preserve"
        ? "Click an element to preserve its colors"
        : "Click an element to map its color"
    } · Esc to cancel</div>
    <div class="highlight hidden"></div>
    <div class="label hidden"></div>
    <div class="panel map hidden">
      <h2>Map element color</h2>
      <p class="selector"></p>
      <label class="scope-row hidden">
        <input type="checkbox" class="scope-toggle" checked>
        <span class="scope-text"></span>
      </label>
      <label for="property">Property</label>
      <select id="property">
        ${(Object.keys(propertyLabels) as UserRuleProperty[])
          .map(
            (property) =>
              `<option value="${property}">${propertyLabels[property]}</option>`,
          )
          .join("")}
      </select>
      <label>Theme role</label>
      <div class="swatches">
        ${(["background", "surface", "foreground", "accent"] as UserRuleTarget[])
          .map(
            (target) => `<button class="swatch" data-target="${target}">
              <i style="background:${colors[target]}"></i>
              <span>${target[0]!.toUpperCase() + target.slice(1)}</span>
            </button>`,
          )
          .join("")}
      </div>
      <button class="cancel">Cancel</button>
    </div>
    <div class="panel preserve hidden">
      <h2>Preserve element colors</h2>
      <p class="selector"></p>
      <p class="warning"></p>
      <button class="action preserve-one">Only this element</button>
      <button class="cancel preserve-cancel">Cancel</button>
    </div>
    <div class="toast hidden"></div>
  `;
  doc.documentElement.append(host);
  const previousCursor = doc.documentElement.style.cursor;
  doc.documentElement.style.cursor = "crosshair";
  const previousUserSelect = doc.documentElement.style.userSelect;
  doc.documentElement.style.userSelect = "none";

  const highlight = shadow.querySelector<HTMLElement>(".highlight")!;
  const label = shadow.querySelector<HTMLElement>(".label")!;
  const mapPanel = shadow.querySelector<HTMLElement>(".panel.map")!;
  const preservePanel = shadow.querySelector<HTMLElement>(".panel.preserve")!;
  const mapSelector = mapPanel.querySelector<HTMLElement>(".selector")!;
  const preserveSelector = preservePanel.querySelector<HTMLElement>(".selector")!;
  const preserveWarning = preservePanel.querySelector<HTMLElement>(".warning")!;
  const scopeRow = mapPanel.querySelector<HTMLElement>(".scope-row")!;
  const scopeToggle =
    mapPanel.querySelector<HTMLInputElement>(".scope-toggle")!;
  const scopeText = mapPanel.querySelector<HTMLElement>(".scope-text")!;
  const preserveOne =
    preservePanel.querySelector<HTMLButtonElement>(".preserve-one")!;
  const propertySelect = shadow.querySelector<HTMLSelectElement>("#property")!;
  const hint = shadow.querySelector<HTMLElement>(".hint")!;
  const toast = shadow.querySelector<HTMLElement>(".toast")!;

  let finished = false;
  let frozen = false;
  let selected: Element | null = null;
  let selection: FamilySelection | null = null;

  const updateHighlight = (element: Element) => {
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    label.textContent = element.localName + (element.id ? `#${element.id}` : "");
    label.style.left = `${Math.max(8, rect.left)}px`;
    label.style.top = `${Math.max(8, rect.top - 24)}px`;
    highlight.classList.remove("hidden");
    label.classList.remove("hidden");
  };

  const elementAt = (event: MouseEvent) => {
    const element = doc.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === host || element.closest("[data-duxreader-picker]"))
      return null;
    return element;
  };

  const onMove = (event: MouseEvent) => {
    if (frozen || finished) return;
    const element = elementAt(event);
    if (element) updateHighlight(element);
  };

  const updateScopeText = () => {
    if (!selection) return;
    scopeText.textContent = scopeToggle.checked
      ? `Apply to all ${elementCount(selection.matches.length)}`
      : "Apply to this element only";
    mapSelector.textContent = scopeToggle.checked
      ? selection.selector
      : selection.exact;
  };

  const showMapPanel = (element: Element, family: FamilySelection) => {
    selected = element;
    selection = family;
    frozen = true;
    scopeRow.classList.toggle("hidden", family.matches.length <= 1);
    scopeToggle.checked = family.matches.length > 1;
    updateScopeText();
    const background = getComputedStyle(element).backgroundColor;
    propertySelect.value =
      background && background !== "rgba(0, 0, 0, 0)"
        ? "background-color"
        : "color";
    hint.classList.add("hidden");
    mapPanel.classList.remove("hidden");
  };

  const showPreservePanel = (
    element: Element,
    family: FamilySelection,
    variants: number,
  ) => {
    selected = element;
    selection = family;
    frozen = true;
    preserveSelector.textContent = family.selector;
    preserveWarning.textContent = `${family.matches.length} matching elements have ${variants} different color sets. One snapshot would freeze them all to this element's colors. Map them to theme roles instead, or keep their formula in a site rule.`;
    hint.classList.add("hidden");
    preservePanel.classList.remove("hidden");
  };

  const showToast = (text: string, error = false) => {
    toast.textContent = text;
    toast.style.background = error ? colors.accent : colors.foreground;
    toast.classList.remove("hidden");
  };

  const cleanup = () => {
    if (finished) return;
    finished = true;
    doc.removeEventListener("mousemove", onMove, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("mousedown", onMouseDown, true);
    doc.documentElement.style.cursor = previousCursor;
    doc.documentElement.style.userSelect = previousUserSelect;
    host.remove();
  };

  const finish = (text: string, error = false) => {
    highlight.classList.add("hidden");
    label.classList.add("hidden");
    mapPanel.classList.add("hidden");
    preservePanel.classList.add("hidden");
    showToast(text, error);
    setTimeout(cleanup, error ? 1800 : 700);
  };

  const run = async (
    action: () => Promise<void> | void,
    success: string,
  ) => {
    try {
      await action();
      if (!finished) finish(success);
    } catch (error) {
      console.error("Duxreader picker:", error);
      finish(String(error), true);
    }
  };

  const startPreserve = (element: Element, family: FamilySelection) => {
    void (async () => {
      try {
        const probe = await options.onPreserve({
          element,
          selector: family.selector,
          matches: family.matches,
          commit: false,
        });
        if (finished) return;
        if (probe.variants === 0) {
          finish("This element has no colors to preserve.", true);
          return;
        }
        if (probe.variants <= 1 || family.matches.length <= 1) {
          const saved = await options.onPreserve({
            element,
            selector: family.selector,
            matches: family.matches,
            commit: true,
          });
          if (finished) return;
          finish(
            `Colors preserved for ${elementCount(
              saved.saved ? family.matches.length : 1,
            )}`,
          );
          return;
        }
        showPreservePanel(element, family, probe.variants);
      } catch (error) {
        console.error("Duxreader picker:", error);
        finish(String(error), true);
      }
    })();
  };

  const onClick = (event: MouseEvent) => {
    if (finished) return;
    if (event.composedPath().includes(host)) return;
    if (frozen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const element = elementAt(event);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const resolved = resolvePickerTarget(element);
    updateHighlight(resolved.element);
    if (options.mode === "preserve") {
      startPreserve(resolved.element, resolved.selection);
    } else {
      showMapPanel(resolved.element, resolved.selection);
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.composedPath().includes(host)) return;
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    }
  };

  scopeToggle.addEventListener("change", updateScopeText);

  shadow
    .querySelectorAll<HTMLButtonElement>(".swatch")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (!selection || button.disabled) return;
        const selector = scopeToggle.checked
          ? selection.selector
          : selection.exact;
        const count = scopeToggle.checked ? selection.matches.length : 1;
        void run(async () => {
          await options.onMap(
            selector,
            propertySelect.value as UserRuleProperty,
            button.dataset.target as UserRuleTarget,
          );
        }, `Mapping saved for ${elementCount(count)}`);
      });
    });

  preserveOne.addEventListener("click", () => {
    const element = selected;
    const family = selection;
    if (!element || !family) return;
    void run(async () => {
      await options.onPreserve({
        element,
        selector: family.exact,
        matches: [element],
        commit: true,
      });
    }, "Element colors preserved");
  });

  shadow
    .querySelectorAll<HTMLButtonElement>(".cancel")
    .forEach((button) => button.addEventListener("click", cleanup));

  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("mousedown", onMouseDown, true);

  return cleanup;
}
