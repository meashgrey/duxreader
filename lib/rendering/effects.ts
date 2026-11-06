import { neutral, parseColor, sameColor } from "../color-roles";

// Computed gradients/shadows contain normalized color tokens. Keep geometry,
// stop positions, URLs, and offsets; replace eligible colors with palette roles.
export function mapEffect(
  value: string,
  kind: "image" | "shadow" | "text",
  pageBackground: string,
): string | undefined {
  if (!value || value === "none") return;
  if (
    kind === "image" &&
    (!value.includes("gradient(") || value.includes("url("))
  )
    return;
  const base = parseColor(pageBackground);
  let changed = false;
  const mapped = value.replace(
    /\b(?:rgba?|hsla?|oklab|oklch|color)\([^()]*\)/g,
    (token) => {
      const color = parseColor(token);
      if (!color || !neutral(color) || color.a <= 0.01) return token;
      changed = true;
      const palette =
        kind === "shadow"
          ? "var(--dux-border)"
          : kind === "text"
            ? "var(--dux-fg)"
            : base && sameColor(color, base)
              ? "var(--dux-bg)"
              : "var(--dux-surface)";
      return color.a < 1
        ? `color-mix(in srgb, ${palette} ${color.a * 100}%, transparent)`
        : palette;
    },
  );
  return changed ? mapped : undefined;
}
