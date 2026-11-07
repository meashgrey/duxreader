import {
  applyUIFont,
  installedUIFonts,
  normalizeUIFont,
  UI_FONT_KEY,
} from "../ui-font";

interface StorageApi {
  local: {
    get(key: string): Promise<Record<string, unknown>>;
    set(value: Record<string, unknown>): Promise<void>;
  };
  onChanged: {
    addListener(
      listener: (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => void,
    ): void;
  };
}
const storage = (
  (
    globalThis as unknown as {
      browser?: { storage: StorageApi };
      chrome: { storage: StorageApi };
    }
  ).browser ??
  (globalThis as unknown as { chrome: { storage: StorageApi } }).chrome
).storage;
const fontSelect = document.querySelector<HTMLSelectElement>("#ui-font")!;
for (const font of installedUIFonts()) fontSelect.add(new Option(font, font));
function updateFont(value: unknown) {
  const font = normalizeUIFont(value);
  if (![...fontSelect.options].some((option) => option.value === font))
    fontSelect.add(new Option(`${font} (unavailable)`, font));
  fontSelect.value = font;
  applyUIFont(font);
}
let fontChanged = false;
storage.onChanged.addListener((changes, area) => {
  if (area === "local" && UI_FONT_KEY in changes) {
    fontChanged = true;
    updateFont(changes[UI_FONT_KEY]?.newValue);
  }
});
void storage.local.get(UI_FONT_KEY).then((data) => {
  if (!fontChanged) updateFont(data[UI_FONT_KEY]);
});
fontSelect.addEventListener("change", async () => {
  const status = document.querySelector("#font-status")!;
  try {
    await storage.local.set({
      [UI_FONT_KEY]: normalizeUIFont(fontSelect.value),
    });
    status.textContent = "Font saved";
  } catch {
    status.textContent = "Couldn't save font";
  }
});

const paths = [
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 16V5a7 7 0 0 1 0 14Z",
  "M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 12H4V7h16v10ZM5 8h2v2H5V8Zm3 0h2v2H8V8Zm3 0h2v2h-2V8Zm3 0h2v2h-2V8Zm3 0h2v2h-2V8ZM5 11h2v2H5v-2Zm3 0h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v2h-2v-2Zm3 0h2v2h-2v-2ZM8 14h8v2H8v-2Z",
  "M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7L12 2Zm0 5.3 4 9.8-4-1.8-4 1.8 4-9.8Z",
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7.9 9H16a16 16 0 0 0-1.3-6.5 8 8 0 0 1 5.2 6.5ZM12 4c1 1.4 1.8 3.9 2 7h-4c.2-3.1 1-5.6 2-7ZM9.3 4.5A16 16 0 0 0 8 11H4.1a8 8 0 0 1 5.2-6.5ZM4.1 13H8a16 16 0 0 0 1.3 6.5A8 8 0 0 1 4.1 13ZM12 20c-1-1.4-1.8-3.9-2-7h4c-.2 3.1-1 5.6-2 7Zm2.7-.5A16 16 0 0 0 16 13h3.9a8 8 0 0 1-5.2 6.5Z",
  "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V5h14v14Zm-8-3h2v-4h3l-4-4-4 4h3v4Z",
];
const links = [
  ...document.querySelectorAll<HTMLAnchorElement>(".preferences-sidebar nav a"),
];
links.forEach((link, index) => {
  link.querySelector("span")!.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[index]}"/></svg>`;
});
function markSection(id: string) {
  for (const link of links) {
    if (link.hash === `#${id}`) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting);
    if (visible.length) markSection(visible[0]!.target.id);
  },
  { rootMargin: "-10% 0px -65% 0px", threshold: 0 },
);
for (const section of document.querySelectorAll(".settings-section"))
  observer.observe(section);
for (const link of links)
  link.addEventListener("click", () => markSection(link.hash.slice(1)));

const save = document.querySelector<HTMLButtonElement>("#save")!;
const updateSaveState = () => {
  document.querySelector("#save-state")!.textContent = save.disabled
    ? "All changes saved"
    : "Unsaved changes";
};
new MutationObserver(updateSaveState).observe(save, {
  attributes: true,
  attributeFilter: ["disabled"],
});
