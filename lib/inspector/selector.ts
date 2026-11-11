const colorProperties = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "accent-color",
  "fill",
  "stroke",
  "box-shadow",
] as const;

const escapeClass = (name: string) =>
  typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(name)
    : name.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

export function selectorFor(element: Element): string {
  const doc = element.ownerDocument;
  if (element === doc.documentElement) return "html";
  if (element === doc.body) return "body";
  if (element.id) {
    const selector = `#${escapeClass(element.id)}`;
    if (doc.querySelectorAll(selector).length === 1) return selector;
  }

  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== doc.documentElement) {
    let part = node.localName;
    const classes = [...node.classList]
      .filter((name) => name.length < 64 && !/[^\w-]/.test(name))
      .slice(0, 2);
    if (classes.length)
      part += `.${classes.map(escapeClass).join(".")}`;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter(
        (child) => child.localName === node!.localName,
      );
      if (siblings.length > 1)
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    if (doc.querySelectorAll(selector).length === 1) return selector;
    node = parent;
  }
  return parts.join(" > ");
}

export function captureColorDeclarations(element: Element): string {
  const style = getComputedStyle(element);
  return colorProperties
    .map((property) => {
      const value = style.getPropertyValue(property);
      if (!value || (property === "background-image" && value === "none"))
        return "";
      return `${property}:${value}!important;`;
    })
    .filter(Boolean)
    .join("");
}
