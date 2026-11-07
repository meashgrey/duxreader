// The page-world helper carries invalidation signals only. It has no access to
// extension storage, theme data, native messaging, or network privileges.
export const CSSOM_ENABLE = "duxreader:cssom-enable";
export const CSSOM_DISABLE = "duxreader:cssom-disable";
export const CSSOM_CHANGED = "duxreader:cssom-changed";
export const SHADOW_ATTACHED = "duxreader:shadow-attached";
export const CSSOM_RELEASE = "duxreader:cssom-release";
export const CSSOM_READY = "duxreader:cssom-ready";

export function installCSSOMProxy(doc: Document = document) {
  const win = doc.defaultView!;
  const realm = win as unknown as typeof globalThis;
  let restore: Array<() => void> = [];
  let enabled = false;
  const own = (node: Node | null) =>
    node instanceof realm.Element && node.hasAttribute("data-duxreader-sheet");
  function report(sheet?: CSSStyleSheet | null) {
    if (!enabled) return;
    if (sheet && own(sheet.ownerNode)) return;
    (sheet?.ownerNode ?? doc).dispatchEvent(
      new realm.Event(CSSOM_CHANGED, { bubbles: true, composed: true }),
    );
  }
  function wrap(
    proto: object,
    key: string,
    part: "value" | "set",
    after: (receiver: any, result: any) => void,
  ) {
    const original = Object.getOwnPropertyDescriptor(proto, key);
    if (
      !original ||
      !original.configurable ||
      typeof original[part] !== "function"
    )
      return;
    const native = original[part];
    const replacement = function (this: unknown, ...args: unknown[]) {
      const result = Reflect.apply(native, this, args);
      // Notification failures must not change the behavior of a native API.
      try {
        after(this, result);
      } catch {
        /* Polling remains available. */
      }
      return result;
    };
    Object.defineProperty(proto, key, { ...original, [part]: replacement });
    restore.push(() => {
      // Preserve wrappers installed later by the page or another extension.
      if (Object.getOwnPropertyDescriptor(proto, key)?.[part] === replacement)
        Object.defineProperty(proto, key, original);
    });
  }
  function enable() {
    if (enabled) {
      doc.dispatchEvent(new realm.Event(CSSOM_READY));
      return;
    }
    enabled = true;
    const sheetProto = realm.CSSStyleSheet.prototype;
    for (const key of [
      "insertRule",
      "deleteRule",
      "addRule",
      "removeRule",
      "replaceSync",
    ])
      wrap(sheetProto, key, "value", (sheet) => report(sheet));
    wrap(
      sheetProto,
      "replace",
      "value",
      (sheet, promise: Promise<CSSStyleSheet>) => {
        void promise.then(
          () => report(sheet),
          () => {},
        );
      },
    );
    if (realm.CSSGroupingRule)
      for (const key of ["insertRule", "deleteRule"])
        wrap(realm.CSSGroupingRule.prototype, key, "value", (rule) =>
          report(rule.parentStyleSheet),
        );
    for (const key of ["setProperty", "removeProperty"])
      wrap(realm.CSSStyleDeclaration.prototype, key, "value", (style) => {
        if (style.parentRule) report(style.parentRule.parentStyleSheet);
      });
    wrap(realm.CSSStyleDeclaration.prototype, "cssText", "set", (style) => {
      if (style.parentRule) report(style.parentRule.parentStyleSheet);
    });
    // Engines expose named declaration setters on different prototype levels.
    const declarationKeys = new Set<string>();
    for (
      let proto: object | null = Object.getPrototypeOf(
        doc.createElement("span").style,
      );
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    )
      for (const key of Object.getOwnPropertyNames(proto))
        if (
          /^(?:color$|background|border|outline|columnRule|fill|stroke|boxShadow|textShadow|textDecoration|textEmphasis|caretColor|accentColor|webkitTextFillColor)/.test(
            key,
          )
        )
          declarationKeys.add(key);
    for (const key of declarationKeys) {
      let proto: object | null = Object.getPrototypeOf(
        doc.createElement("span").style,
      );
      while (proto && !Object.getOwnPropertyDescriptor(proto, key))
        proto = Object.getPrototypeOf(proto);
      if (proto)
        wrap(proto, key, "set", (style) => {
          if (style.parentRule) report(style.parentRule.parentStyleSheet);
        });
    }
    if (realm.CSSKeyframeRule)
      wrap(realm.CSSKeyframeRule.prototype, "keyText", "set", (rule) =>
        report(rule.parentStyleSheet),
      );
    if (realm.CSSKeyframesRule)
      for (const key of ["appendRule", "deleteRule"])
        wrap(realm.CSSKeyframesRule.prototype, key, "value", (rule) =>
          report(rule.parentStyleSheet),
        );
    wrap(realm.CSSStyleRule.prototype, "selectorText", "set", (rule) =>
      report(rule.parentStyleSheet),
    );
    // Disabled sheets and in-place adoptedStyleSheets array edits also have a
    // polling fallback. The common setter paths report immediately.
    wrap(sheetProto, "disabled", "set", (sheet) => report(sheet));
    for (const proto of [realm.Document.prototype, realm.ShadowRoot.prototype])
      wrap(proto, "adoptedStyleSheets", "set", () => report());
    wrap(realm.Element.prototype, "attachShadow", "value", (host: Element) => {
      host.dispatchEvent(
        new realm.Event(SHADOW_ATTACHED, { bubbles: true, composed: true }),
      );
    });
    doc.dispatchEvent(new realm.Event(CSSOM_READY));
  }
  function disable() {
    enabled = false;
    const callbacks = restore;
    restore = [];
    for (const callback of callbacks.reverse()) callback();
  }
  // Replace a helper left by a development reload before wrapping any APIs.
  doc.dispatchEvent(new realm.Event(CSSOM_RELEASE));
  doc.addEventListener(CSSOM_ENABLE, enable);
  doc.addEventListener(CSSOM_DISABLE, disable);
  const release = () => {
    disable();
    doc.removeEventListener(CSSOM_ENABLE, enable);
    doc.removeEventListener(CSSOM_DISABLE, disable);
    doc.removeEventListener(CSSOM_RELEASE, release);
  };
  doc.addEventListener(CSSOM_RELEASE, release);
  return release;
}
