import type { Theme } from "../theme";
import { selectorFor } from "./selector";
import type { UserRuleProperty, UserRuleTarget } from "./rules";

export type PickerMode = "preserve" | "map";

export interface PickerCallbacks {
  onPreserve(element: Element, selector: string): Promise<void> | void;
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
      .panel label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        opacity: 0.8;
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
      .swatch, .cancel {
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
      .swatch:hover, .cancel:hover {
        background: color-mix(in srgb, ${colors.accent} 18%, ${colors.background});
      }
      .cancel {
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
    <div class="panel hidden">
      <h2>Map element color</h2>
      <p class="selector"></p>
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
    <div class="toast hidden"></div>
  `;
  doc.documentElement.append(host);
  const previousCursor = doc.documentElement.style.cursor;
  doc.documentElement.style.cursor = "crosshair";
  const previousUserSelect = doc.documentElement.style.userSelect;
  doc.documentElement.style.userSelect = "none";

  const highlight = shadow.querySelector<HTMLElement>(".highlight")!;
  const label = shadow.querySelector<HTMLElement>(".label")!;
  const panel = shadow.querySelector<HTMLElement>(".panel")!;
  const hint = shadow.querySelector<HTMLElement>(".hint")!;
  const selectorText = shadow.querySelector<HTMLElement>(".selector")!;
  const propertySelect = shadow.querySelector<HTMLSelectElement>("#property")!;
  const toast = shadow.querySelector<HTMLElement>(".toast")!;

  let finished = false;
  let frozen = false;
  let selected: Element | null = null;

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

  const showPanel = (element: Element, selector: string) => {
    selected = element;
    frozen = true;
    selectorText.textContent = selector;
    const background = getComputedStyle(element).backgroundColor;
    propertySelect.value =
      background && background !== "rgba(0, 0, 0, 0)"
        ? "background-color"
        : "color";
    hint.classList.add("hidden");
    panel.classList.remove("hidden");
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
    panel.classList.add("hidden");
    showToast(text, error);
    setTimeout(cleanup, error ? 1800 : 700);
  };

  const run = async (
    action: () => Promise<void> | void,
    success: string,
  ) => {
    try {
      await action();
      finish(success);
    } catch (error) {
      console.error("Duxreader picker:", error);
      finish(String(error), true);
    }
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
    const selector = selectorFor(element);
    if (options.mode === "preserve") {
      void run(
        () => options.onPreserve(element, selector),
        "Element colors preserved",
      );
    } else {
      updateHighlight(element);
      showPanel(element, selector);
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

  shadow
    .querySelectorAll<HTMLButtonElement>(".swatch")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const element = selected;
        if (!element || button.disabled) return;
        void run(async () => {
          await options.onMap(
            selectorFor(element),
            propertySelect.value as UserRuleProperty,
            button.dataset.target as UserRuleTarget,
          );
        }, "Mapping rule saved");
      });
    });
  shadow.querySelector<HTMLButtonElement>(".cancel")?.addEventListener(
    "click",
    cleanup,
  );

  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("mousedown", onMouseDown, true);

  return cleanup;
}
