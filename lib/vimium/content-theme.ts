import { materialRoles } from "../material";
import type { Theme } from "../theme";

// Vimium's content scripts draw link hints, find-mode selections, and the
// shadow-DOM iframe shells with hard-coded colors. Map every visible surface
// onto the same roles as the rest of the page so the desktop palette owns them.
export function vimiumContentTheme(theme: Theme): string {
  const roles = materialRoles(theme);
  const role = (name: string) => roles[name]!;
  return `
:root {
  --vimium-background-color: ${role("surface-container")};
  --vimium-background-text-color: ${role("on-surface")};
  --vimium-foreground-color: ${role("surface-container-high")};
  --vimium-foreground-text-color: ${role("on-surface")};
  --vimium-link-color: ${role("primary")};
}
body.vimium-find-mode ::selection {
  background: ${role("primary")} !important;
  color: ${role("on-primary")} !important;
}
div.internal-vimium-hint-marker {
  background: ${role("primary-container")} !important;
  border-color: ${role("primary")} !important;
  color: ${role("on-primary-container")} !important;
  box-shadow: 0 3px 7px 0 color-mix(in srgb, ${role("surface-container-lowest")} 70%, transparent) !important;
}
div.internal-vimium-hint-marker,
div.internal-vimium-hint-marker span {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  color: ${role("on-primary-container")} !important;
  text-shadow: none !important;
}
div.internal-vimium-hint-marker > .matchingCharacter {
  color: ${role("primary")} !important;
}
div > .vimiumActiveHintMarker span {
  color: ${role("on-primary")} !important;
}
div.vimiumActiveHintMarker {
  background: ${role("primary")} !important;
  border-color: ${role("primary")} !important;
}
div.internal-vimium-input-hint {
  background-color: color-mix(in srgb, ${role("primary")} 30%, transparent) !important;
  border-color: ${role("primary")} !important;
}
div.internal-vimium-selected-input-hint {
  background-color: color-mix(in srgb, ${role("error")} 30%, transparent) !important;
  border-color: ${role("error")} !important;
}
div.internal-vimium-selected-input-hint span {
  color: ${role("on-error")} !important;
}
div.vimium-highlighted-frame {
  border-color: ${role("primary")} !important;
}
iframe.vimium-help-dialog-frame {
  background-color: color-mix(in srgb, ${role("surface-container-lowest")} 65%, transparent) !important;
}
div.vimium-flash {
  box-shadow: 0 0 4px 2px ${role("primary")} !important;
}
iframe.vimium-ui-component-visible {
  color-scheme: ${theme.mode};
}
`;
}
