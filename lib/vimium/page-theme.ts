import "./firefox-api";
import { applyUIFont, UI_FONT_KEY } from "../ui-font";
import { materialRoles } from "../material";
import { defaultTheme, isTheme, THEME_KEY } from "../theme";

interface StorageApi {
  local: { get(key: string): Promise<Record<string, unknown>> };
  onChanged: {
    addListener(
      listener: (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => void,
    ): void;
  };
}

const api = (
  (globalThis as { browser?: { storage: StorageApi } }).browser ??
  (globalThis as unknown as { chrome: { storage: StorageApi } }).chrome
).storage;

function apply(value: unknown) {
  const theme = isTheme(value) ? value : defaultTheme;
  const root = document.documentElement;
  root.style.colorScheme = theme.mode;
  root.dataset.duxreaderTheme = theme.mode;
  for (const [role, color] of Object.entries(materialRoles(theme)))
    root.style.setProperty(`--md-sys-color-${role}`, color);
}

api.onChanged.addListener((changes, area) => {
  if (area === "local" && UI_FONT_KEY in changes)
    applyUIFont(changes[UI_FONT_KEY]?.newValue);
  if (area === "local" && THEME_KEY in changes)
    apply(changes[THEME_KEY]?.newValue);
});
void api.local.get(THEME_KEY).then((data) => apply(data[THEME_KEY]));

void api.local.get(UI_FONT_KEY).then((data) => applyUIFont(data[UI_FONT_KEY]));
