const labelSelector =
  ':is(span[class*="Token-IssueLabel"], [class*="hx_IssueLabel"])';

// Labels compute their colors from element-scoped variables (--label-r/g/b/h/s/l).
// Upstream cannot resolve those variables inside rgb()/hsl(), substitutes a palette
// role, and turns every label into a surface chip. Restate GitHub's own formulas so
// all labels keep their native color in both page color modes.
function labelColors(scope: string, mode: "light" | "dark"): string {
  const dark = mode === "dark";
  const background = dark
    ? "rgb(var(--label-r), var(--label-g), var(--label-b), var(--background-alpha, 1))"
    : "rgb(var(--label-r), var(--label-g), var(--label-b))";
  const text = dark
    ? "hsl(var(--label-h), calc(var(--label-s) * 1%), calc((var(--label-l) + var(--lighten-by, 0)) * 1%))"
    : "hsl(0deg, 0%, calc(var(--lightness-switch, 1) * 100%))";
  const borderLightness = dark
    ? "calc((var(--label-l) + var(--lighten-by, 0)) * 1%)"
    : "calc((var(--label-l) - 25) * 1%)";
  return `${scope} ${labelSelector} {
  background: ${background} !important;
  border-color: hsl(var(--label-h), calc(var(--label-s) * 1%), ${borderLightness}, var(--border-alpha, 1)) !important;
  color: ${text} !important;
}`;
}

export default [
  labelColors('[data-color-mode="light"]', "light"),
  `@media (prefers-color-scheme: light) {${labelColors('[data-color-mode="auto"][data-light-theme*="light"]', "light")}}`,
  labelColors('[data-color-mode="dark"]', "dark"),
  `@media (prefers-color-scheme: dark) {${labelColors('[data-color-mode="auto"][data-dark-theme*="dark"]', "dark")}}`,
] as const;
