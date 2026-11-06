import { parseColor, type RGB } from "./rendering/color";
export { parseColor, type RGB } from "./rendering/color";
export function luminance(c: RGB): number {
  const values = [c.r, c.g, c.b].map((n) => {
    const v = n / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
export function neutral(c: RGB): boolean {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= 48;
}
export function sameColor(a: RGB, b: RGB): boolean {
  return (
    Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= 8
  );
}
export function onAccent(
  background: string,
  foreground: string,
  accent: string,
): string {
  const base = luminance(parseColor(background)!);
  const text = luminance(parseColor(foreground)!);
  const fill = luminance(parseColor(accent)!);
  const contrast = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  // Choose from the supplied palette, never synthesize a replacement color.
  return contrast(base, fill) >= contrast(text, fill) ? background : foreground;
}

export interface ElementFacts {
  background: string;
  foreground: string;
  border: string;
  pageBackground: string;
  pageForeground: string;
  control: boolean;
  link: boolean;
  large: boolean;
  container: boolean;
  onAccent: boolean;
  preserveSemantic: boolean;
}
export function classify(facts: ElementFacts) {
  const bg = parseColor(facts.background);
  const fg = parseColor(facts.foreground);
  const base = parseColor(facts.pageBackground);
  const pageText = parseColor(facts.pageForeground);
  let background: "base" | "surface" | "accent" | undefined;
  if (bg && bg.a > 0.01) {
    if (facts.large) background = "base";
    else if (!neutral(bg)) {
      if (facts.control && !facts.preserveSemantic) background = "accent";
    } else {
      background =
        (base && base.a > 0 && sameColor(bg, base)) || !facts.container
          ? "base"
          : "surface";
    }
  }
  let foreground: "base" | "muted" | "accent" | "on-accent" | undefined;
  if (background === "accent" || (facts.onAccent && !background))
    foreground = "on-accent";
  else if (facts.link) foreground = "accent";
  else if (fg && fg.a > 0.01 && neutral(fg)) {
    const muted =
      pageText && Math.abs(luminance(fg) - luminance(pageText)) > 0.1;
    foreground = muted ? "muted" : "base";
  }
  const edge = parseColor(facts.border);
  return {
    background,
    foreground,
    border: !!edge && edge.a > 0.01 && neutral(edge),
  };
}
