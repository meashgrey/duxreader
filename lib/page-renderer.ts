import type { Theme } from "./theme";
import { classify, neutral, onAccent, parseColor } from "./color-roles";
import {
  createStyleManager,
  type StyleChange,
  type StyleRoot,
} from "./rendering/style-manager";
import { isPaletteTransition, type Pseudo } from "./rendering/css-analysis";
import { mapEffect } from "./rendering/effects";
import {
  CSSOM_CHANGED,
  CSSOM_DISABLE,
  CSSOM_ENABLE,
  CSSOM_READY,
  SHADOW_ATTACHED,
} from "./rendering/cssom-proxy";

const OWNER = "data-duxreader-sheet";
const NODE = "data-duxreader-node";
const pseudos: Pseudo[] = [
  "before",
  "after",
  "placeholder",
  "marker",
  "selection",
];
const sides = ["top", "right", "bottom", "left"] as const;
const priority = ":not(#duxreader-reserved-a#duxreader-reserved-b)";
const preserved =
  'script,style,link,meta,template,noscript,svg,img,picture,canvas,video,audio,iframe,[role="img"],[data-duxreader-preserve]';
const prefix = (pseudo?: Pseudo) =>
  `data-duxreader${pseudo ? `-${pseudo}` : ""}`;
const own = (node: Node) =>
  node instanceof Element
    ? node.hasAttribute(OWNER)
    : node.parentElement?.hasAttribute(OWNER);
const events = [
  "pointerover",
  "pointerout",
  "pointerdown",
  "pointerup",
  "focusin",
  "focusout",
  "input",
  "change",
  "keydown",
  "keyup",
  "toggle",
  "transitionend",
  "animationend",
];

export function paletteCSS(theme: Theme): string {
  const c = theme.colors,
    material = theme.material ?? {};
  const rule = (selector: string, declarations: string) =>
    `${selector}${priority}{${declarations}}`;
  const roles = (pseudo?: Pseudo) => {
    const attr = prefix(pseudo),
      tail = pseudo ? `::${pseudo}` : "";
    const r = (selector: string, declarations: string) =>
      `${selector}${priority}${tail}{${declarations}}`;
    return [
      r(`[${attr}-bg="base"]`, "background-color:var(--dux-bg)!important"),
      r(
        `[${attr}-bg="surface"]`,
        "background-color:var(--dux-surface)!important",
      ),
      r(
        `[${attr}-bg="accent"]`,
        "background-color:var(--dux-accent)!important",
      ),
      r(`[${attr}-fg="base"]`, "color:var(--dux-fg)!important"),
      r(`[${attr}-fg="muted"]`, "color:var(--dux-muted)!important"),
      r(`[${attr}-fg="accent"]`, "color:var(--dux-accent)!important"),
      r(`[${attr}-fg="on-accent"]`, "color:var(--dux-on-accent)!important"),
      ...sides.map((side) =>
        r(
          `[${attr}-border-${side}]`,
          `border-${side}-color:var(--dux-border)!important`,
        ),
      ),
      r(`[${attr}-outline]`, "outline-color:var(--dux-border)!important"),
    ].join("\n");
  };
  return `:root {
    --dux-bg:${c.background}; --dux-surface:${c.surface};
    --dux-fg:${c.foreground}; --dux-accent:${c.accent};
    --dux-muted:${material["on-surface-variant"] ?? c.foreground};
    --dux-border:${material["outline-variant"] ?? c.surface};
    --dux-on-accent:${material["on-primary"] ?? onAccent(c.background, c.foreground, c.accent)};
    color-scheme:${theme.mode} !important;
  }
  ${rule("html", "background-color:var(--dux-bg)!important;color:var(--dux-fg)!important")}
  ${rule("body", "background-color:var(--dux-bg)!important;color:var(--dux-fg)!important")}
  ${roles()}
  ${pseudos.map((p) => roles(p)).join("\n")}
  ${theme.css}`;
}

interface Snapshot {
  element: HTMLElement;
  pseudo?: Pseudo;
  background: string;
  foreground: string;
  border: string;
  edges: string[];
  outline: string;
  image: string;
  boxShadow: string;
  textShadow: string;
  container: boolean;
  large: boolean;
}
interface RootSheets {
  palette: HTMLStyleElement;
  effects: HTMLStyleElement;
}

// Native computed styles resolve cascade, variable fallbacks, @scope, nesting,
// and container conditions. The stylesheet index locates changed consumers;
// override sheets express their roles exclusively using the desktop palette.
export function createPageRenderer(
  doc: Document = document,
  options: { readCSS?: (url: string) => Promise<string> } = {},
) {
  const win = doc.defaultView!;
  const sheets = new Map<StyleRoot, RootSheets>();
  const originals = new Map<Element, Map<string, string | null>>();
  const pending = new Set<HTMLElement>();
  const scopes = new Set<Element>();
  const walks: Array<{ root: Element; walker: TreeWalker; started: boolean }> =
    [];
  const cache = new Map<Element, Map<string, string>>();
  const locations = new Map<Element, StyleRoot>();
  const rootElements = new Map<StyleRoot, Set<Element>>();
  const removedRoots = new Set<Element>();
  const effects = new Map<Element, Map<string, string>>();
  const dirtyEffects = new Set<StyleRoot>();
  const listeners = new Map<StyleRoot, () => void>();
  const containers = new Set<HTMLElement>();
  const geometryTargets = new Set<HTMLElement>();
  const resizeSizes = new WeakMap<Element, string>();
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
      const before = resizeSizes.get(entry.target);
      resizeSizes.set(entry.target, size);
      if (before !== undefined && before !== size)
        enqueue(entry.target, containers.has(entry.target as HTMLElement));
    }
  });
  let active = false,
    sampling = false,
    stylesDirty = false,
    statesDirty = false,
    prune = false;
  let css = "",
    previous = "",
    serial = 0,
    proxyReady = false;
  let scheduled: number | undefined;
  let polling: ReturnType<typeof setInterval> | undefined;
  const manager = createStyleManager(doc, () => sheets.keys(), affected, {
    readCSS: options.readCSS,
    ready: invalidateStyles,
  });

  function mark(element: Element, name: string, value?: string) {
    if (element.getAttribute(name) === (value ?? null)) return;
    let saved = originals.get(element);
    if (!saved) originals.set(element, (saved = new Map()));
    if (!saved.has(name)) saved.set(name, element.getAttribute(name));
    if (value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
  function restore(element: Element) {
    for (const [key, value] of originals.get(element) ?? []) {
      if (value === null) element.removeAttribute(key);
      else element.setAttribute(key, value);
    }
    originals.delete(element);
    cache.delete(element);
    const root = locations.get(element);
    if (root) rootElements.get(root)?.delete(element);
    if (effects.delete(element) && root) dirtyEffects.add(root);
    locations.delete(element);
    if (element instanceof HTMLElement) {
      geometryTargets.delete(element);
      containers.delete(element);
      resizeObserver.unobserve(element);
      resizeSizes.delete(element);
    }
  }
  function styleElement(kind: string) {
    const style = doc.createElement("style");
    style.setAttribute(OWNER, kind);
    return style;
  }
  function attach(root: StyleRoot) {
    let pair = sheets.get(root);
    if (!pair) {
      pair = {
        palette: styleElement("palette"),
        effects: styleElement("effects"),
      };
      pair.palette.textContent = css;
      sheets.set(root, pair);
      stylesDirty = true;
      observer.observe(
        root instanceof Document ? root.documentElement : root,
        observerOptions,
      );
      for (const event of events)
        root.addEventListener(event, interaction, true);
      listeners.set(root, () => {
        for (const event of events)
          root.removeEventListener(event, interaction, true);
      });
    }
    const parent =
      root instanceof Document ? (root.head ?? root.documentElement) : root;
    for (const style of Object.values(pair)) {
      style.disabled = sampling;
      if (!style.isConnected) parent.append(style);
    }
  }
  function enqueue(element: Element, subtree = true) {
    if (!active || own(element)) return;
    if (element.closest(preserved)) {
      if (
        originals.has(element) ||
        element.matches('[data-duxreader-preserve],[role="img"]')
      ) {
        for (const saved of originals.keys())
          if (saved === element || element.contains(saved)) restore(saved);
      }
      return;
    }
    if (subtree) {
      let parent: Element | null = element;
      while (parent) {
        if (scopes.has(parent)) return;
        parent = parent.parentElement;
      }
      scopes.add(element);
    } else if (element instanceof HTMLElement) pending.add(element);
    schedule();
  }
  function expandScopes() {
    const batch = [...scopes];
    scopes.clear();
    const roots = new Set(batch);
    for (const root of batch) {
      let parent = root.parentElement,
        covered = false;
      while (parent) {
        if (roots.has(parent)) {
          covered = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (covered || !root.isConnected) continue;
      if (walks.some((walk) => walk.root === root)) {
        scopes.add(root);
        continue;
      }
      for (let i = walks.length - 1; i >= 0; i--)
        if (root.contains(walks[i]!.root)) walks.splice(i, 1);
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          const element = node as Element;
          if (own(element) || element.matches(preserved))
            return NodeFilter.FILTER_REJECT;
          return element instanceof HTMLElement
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      });
      walks.push({ root, walker, started: false });
    }
  }
  function nextElement(): HTMLElement | undefined {
    const next = pending.values().next();
    if (!next.done) {
      pending.delete(next.value);
      return next.value;
    }
    while (walks.length) {
      const walk = walks[0]!;
      if (!walk.root.isConnected) {
        walks.shift();
        continue;
      }
      if (walk.started && !walk.root.contains(walk.walker.currentNode)) {
        walk.walker.currentNode = walk.root;
        walk.started = false;
      }
      const element = walk.started ? walk.walker.nextNode() : walk.root;
      walk.started = true;
      if (!element) {
        walks.shift();
        continue;
      }
      if (element instanceof HTMLElement) return element;
    }
  }
  function enqueueRoot(root: StyleRoot) {
    if (root instanceof Document) enqueue(root.documentElement);
    else for (const child of root.children) enqueue(child);
  }
  function affected(change: StyleChange) {
    statesDirty = true;
    if (change.full) {
      enqueueRoot(change.root);
      return;
    }
    for (const selector of change.selectors) {
      try {
        for (const element of change.root.querySelectorAll(selector))
          enqueue(element);
      } catch {
        enqueueRoot(change.root);
        break;
      }
    }
  }
  function schedule() {
    if (active && scheduled === undefined)
      scheduled = win.requestAnimationFrame(flush);
  }
  function invalidateStyles() {
    if (active) {
      stylesDirty = true;
      schedule();
    }
  }
  function interaction(event: Event) {
    if (
      event.type === "transitionend" &&
      isPaletteTransition((event as TransitionEvent).propertyName ?? "")
    )
      return;
    const target = event.composedPath().find((node) => node instanceof Element);
    if (target instanceof Element) enqueue(target);
    statesDirty = true;
    schedule();
  }
  function dropDetached() {
    if (!prune) return;
    prune = false;
    let rebind = false;
    for (const [root, pair] of sheets)
      if (root instanceof ShadowRoot && !root.host.isConnected) {
        pair.palette.remove();
        pair.effects.remove();
        sheets.delete(root);
        listeners.get(root)?.();
        listeners.delete(root);
        dirtyEffects.delete(root);
        for (const element of rootElements.get(root) ?? []) restore(element);
        rootElements.delete(root);
        stylesDirty = true;
        rebind = true;
      }
    for (const root of removedRoots) {
      if (root.isConnected) continue;
      if (locations.has(root) || originals.has(root)) restore(root);
      for (const element of root.querySelectorAll("*"))
        if (locations.has(element) || originals.has(element)) restore(element);
    }
    removedRoots.clear();
    if (rebind) {
      observer.disconnect();
      for (const root of sheets.keys())
        observer.observe(
          root instanceof Document ? root.documentElement : root,
          observerOptions,
        );
    }
  }
  function read(
    element: HTMLElement,
    pseudo?: Pseudo,
    base?: string,
  ): Snapshot | undefined {
    const style = win.getComputedStyle(element, pseudo ? `::${pseudo}` : null);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (
      (pseudo === "before" || pseudo === "after") &&
      ["none", "normal"].includes(style.content)
    )
      return;
    if (!pseudo) {
      const isContainer =
        !!style.containerType && style.containerType !== "normal";
      if (isContainer && !containers.has(element)) {
        containers.add(element);
        resizeObserver.observe(element);
      } else if (
        !isContainer &&
        containers.delete(element) &&
        !geometryTargets.has(element)
      )
        resizeObserver.unobserve(element);
    }
    const largeTag =
      !pseudo &&
      (["HTML", "BODY", "MAIN"].includes(element.tagName) ||
        element.getAttribute("role") === "main");
    const background = parseColor(style.backgroundColor),
      page = base ? parseColor(base) : undefined;
    const bounds =
      !pseudo &&
      !largeTag &&
      background &&
      background.a > 0.01 &&
      (!page ||
        Math.max(
          Math.abs(background.r - page.r),
          Math.abs(background.g - page.g),
          Math.abs(background.b - page.b),
        ) > 8)
        ? element.getBoundingClientRect()
        : undefined;
    if (!pseudo) {
      if (bounds && !geometryTargets.has(element)) {
        geometryTargets.add(element);
        if (!containers.has(element)) resizeObserver.observe(element);
      } else if (
        !bounds &&
        geometryTargets.delete(element) &&
        !containers.has(element)
      )
        resizeObserver.unobserve(element);
    }
    const control = element.matches(
      'button,input,select,textarea,[role="button"],[role="tab"]',
    );
    const edges = sides.map((side) =>
      style.getPropertyValue(`border-${side}-style`) !== "none" &&
      style.getPropertyValue(`border-${side}-width`) !== "0px"
        ? style.getPropertyValue(`border-${side}-color`)
        : "transparent",
    );
    return {
      element,
      pseudo,
      background: style.backgroundColor,
      foreground: style.color,
      border: edges[0]!,
      edges,
      outline:
        style.outlineStyle !== "none" && style.outlineWidth !== "0px"
          ? style.outlineColor
          : "transparent",
      image: style.backgroundImage,
      boxShadow: style.boxShadow,
      textShadow: style.textShadow,
      container:
        !!pseudo ||
        control ||
        element.matches(
          'pre,code,aside,nav,header,section,article,dialog,table,[role="menu"],[role="dialog"]',
        ) ||
        style.borderTopLeftRadius !== "0px" ||
        style.borderTopWidth !== "0px" ||
        style.boxShadow !== "none",
      large:
        largeTag ||
        (!!bounds &&
          bounds.width >= win.innerWidth * 0.65 &&
          bounds.height >= win.innerHeight * 0.5),
    };
  }
  function clearPseudo(element: Element, pseudo: Pseudo) {
    if (!cache.get(element)?.has(pseudo) && !effects.get(element)?.has(pseudo))
      return;
    const attr = prefix(pseudo);
    for (const key of [
      "bg",
      "fg",
      "outline",
      ...sides.map((side) => `border-${side}`),
    ])
      mark(element, `${attr}-${key}`);
    const stored = effects.get(element);
    if (stored?.delete(pseudo))
      dirtyEffects.add(element.getRootNode() as StyleRoot);
    cache.get(element)?.delete(pseudo);
  }
  function onAccentAncestor(element: Element, pseudo?: Pseudo): boolean {
    let parent = pseudo
      ? element
      : (element.parentElement ?? (element.getRootNode() as ShadowRoot).host);
    while (parent) {
      if (parent.getAttribute("data-duxreader-bg") === "accent") return true;
      if (parent.getAttribute("data-duxreader-bg")) return false;
      parent =
        parent.parentElement ?? (parent.getRootNode() as ShadowRoot).host;
    }
    return false;
  }
  function write(row: Snapshot, base: string, text: string) {
    const element = row.element,
      pseudo = row.pseudo,
      attr = prefix(pseudo);
    const root = element.getRootNode() as StyleRoot;
    const oldRoot = locations.get(element);
    if (oldRoot !== root) {
      cache.delete(element);
      if (oldRoot) dirtyEffects.add(oldRoot);
      if (oldRoot) rootElements.get(oldRoot)?.delete(element);
      locations.set(element, root);
      let owned = rootElements.get(root);
      if (!owned) rootElements.set(root, (owned = new Set()));
      owned.add(element);
      dirtyEffects.add(root);
    }
    const onAccent = onAccentAncestor(element, pseudo);
    const control =
      pseudo === "selection" ||
      element.matches(
        'button,input,select,textarea,[role="button"],[role="tab"]',
      );
    const link = element.matches('a[href],[role="link"]');
    const preserveSemantic = element.matches(
      '[role="alert"],[aria-invalid="true"]',
    );
    const signature = [
      row.background,
      row.foreground,
      ...row.edges,
      row.outline,
      row.image,
      row.boxShadow,
      row.textShadow,
      row.container,
      row.large,
      base,
      text,
      onAccent,
      control,
      link,
      preserveSemantic,
    ].join("\0");
    let saved = cache.get(element);
    if (!saved) cache.set(element, (saved = new Map()));
    if (saved.get(pseudo ?? "") === signature) return;
    saved.set(pseudo ?? "", signature);
    const roles = classify({
      ...row,
      pageBackground: base,
      pageForeground: text,
      onAccent,
      control,
      link,
      preserveSemantic,
    });
    mark(element, `${attr}-bg`, roles.background);
    mark(element, `${attr}-fg`, roles.foreground);
    for (let i = 0; i < sides.length; i++) {
      const edge = parseColor(row.edges[i]!);
      mark(
        element,
        `${attr}-border-${sides[i]}`,
        edge && edge.a > 0.01 && neutral(edge) ? "" : undefined,
      );
    }
    const outline = parseColor(row.outline);
    mark(
      element,
      `${attr}-outline`,
      outline && outline.a > 0.01 && neutral(outline) ? "" : undefined,
    );
    const values: string[] = [];
    const image = mapEffect(row.image, "image", base),
      box = mapEffect(row.boxShadow, "shadow", base),
      shadow = mapEffect(row.textShadow, "text", base);
    if (image) values.push(`background-image:${image}!important`);
    if (box) values.push(`box-shadow:${box}!important`);
    if (shadow) values.push(`text-shadow:${shadow}!important`);
    const declarations = values.join(";");
    let stored = effects.get(element);
    if (declarations) {
      if (!stored) effects.set(element, (stored = new Map()));
      if (stored.get(pseudo ?? "") !== declarations) {
        if (!originals.get(element)?.has(NODE))
          mark(element, NODE, `dux-${++serial}`);
        stored.set(pseudo ?? "", declarations);
        dirtyEffects.add(element.getRootNode() as StyleRoot);
      }
    } else if (stored?.delete(pseudo ?? ""))
      dirtyEffects.add(element.getRootNode() as StyleRoot);
  }
  function syncEffects() {
    for (const root of dirtyEffects) {
      const pair = sheets.get(root);
      if (!pair) continue;
      const rules: string[] = [];
      for (const [element, entries] of effects)
        if (element.getRootNode() === root) {
          for (const [pseudo, declarations] of entries)
            rules.push(
              `[${NODE}="${element.getAttribute(NODE)}"]${priority}${pseudo ? `::${pseudo}` : ""}{${declarations}}`,
            );
        }
      const next = rules.join("\n");
      if (pair.effects.textContent !== next) pair.effects.textContent = next;
    }
    dirtyEffects.clear();
  }
  function flush() {
    scheduled = undefined;
    if (!active) return;
    dropDetached();
    for (const root of sheets.keys()) attach(root);
    if (stylesDirty) {
      stylesDirty = false;
      manager.refresh();
    }
    if (statesDirty) {
      statesDirty = false;
      for (const element of manager.stateCandidates()) enqueue(element);
    }
    expandScopes();
    if (!pending.size && !walks.length && !dirtyEffects.size) return;
    sampling = true;
    for (const pair of sheets.values()) {
      pair.palette.disabled = true;
      pair.effects.disabled = true;
    }
    try {
      const body = win.getComputedStyle(doc.body ?? doc.documentElement),
        html = win.getComputedStyle(doc.documentElement);
      const bodyBG = parseColor(body.backgroundColor);
      const base =
          bodyBG && bodyBG.a > 0 ? body.backgroundColor : html.backgroundColor,
        text = body.color;
      const rows: Snapshot[] = [];
      const absent: Array<[HTMLElement, Pseudo]> = [];
      // Amortize the unavoidable root style flush across a useful batch. The
      // incremental read budget starts after source styles have been resolved.
      const started = win.performance.now();
      let processed = 0;
      while (pending.size || walks.length) {
        if (
          processed >= 512 ||
          (processed > 0 && win.performance.now() - started >= 5)
        )
          break;
        const element = nextElement();
        if (!element) break;
        processed++;
        if (!element.isConnected || element.closest(preserved)) continue;
        if (element.shadowRoot) {
          const root = element.shadowRoot,
            fresh = !sheets.has(root);
          attach(root);
          if (fresh) enqueueRoot(root);
        }
        const normal = read(element, undefined, base);
        if (normal) rows.push(normal);
        const types = manager.pseudoTypes(element);
        for (const pseudo of pseudos) {
          const row = types.has(pseudo)
            ? read(element, pseudo, base)
            : undefined;
          if (row) rows.push(row);
          else absent.push([element, pseudo]);
        }
      }
      for (const [element, pseudo] of absent) clearPseudo(element, pseudo);
      for (const row of rows) write(row, base, text);
      syncEffects();
    } finally {
      sampling = false;
      for (const pair of sheets.values()) {
        pair.palette.disabled = false;
        pair.effects.disabled = false;
      }
    }
    if (pending.size || walks.length || scopes.size || stylesDirty) schedule();
  }
  const observerOptions = {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
    attributeOldValue: true,
  };
  const observer = new MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      if (
        own(record.target) ||
        (record.type === "attributes" &&
          record.attributeName?.startsWith("data-duxreader-") &&
          record.attributeName !== "data-duxreader-preserve")
      )
        continue;
      if (
        record.target instanceof Element &&
        record.target.matches("style,link")
      ) {
        invalidateStyles();
        continue;
      }
      if (record.type === "attributes" && record.target instanceof Element) {
        if (
          record.attributeName === "data-duxreader-preserve" ||
          record.attributeName === "role"
        )
          enqueue(record.target);
        enqueue(record.target.parentElement ?? record.target);
        // Variable definitions can invalidate alias consumers elsewhere in an
        // inherited subtree, even if no declaration or rule count changes.
        if (record.attributeName === "style") {
          const names = new Set(
            [
              ...(record.oldValue ?? "").matchAll(/(--[\w-]+)\s*:/g),
              ...(record.target.getAttribute("style") ?? "").matchAll(
                /(--[\w-]+)\s*:/g,
              ),
            ].map((m) => m[1]!),
          );
          const selectors = manager.variableSelectors(names);
          if (selectors.size)
            for (const root of sheets.keys())
              affected({ root, selectors, full: false });
        }
        if (manager.hasRelationalSelectors(record.attributeName ?? undefined))
          statesDirty = true;
      }
      if (record.type === "childList") {
        let relevant = false;
        for (const node of [...record.addedNodes, ...record.removedNodes])
          if (!own(node)) {
            relevant = true;
            if (
              node instanceof Element &&
              (node.matches("style,link") || node.querySelector("style,link"))
            )
              invalidateStyles();
          }
        const removedElements = [...record.removedNodes].some(
          (node) => node instanceof Element,
        );
        const addedElements = [...record.addedNodes].some(
          (node) => node instanceof Element,
        );
        const parent =
          record.target instanceof Element ? record.target : undefined;
        // Replacing one nonempty text node with another cannot change :empty.
        // Actual size changes are handled by ResizeObserver without toggling
        // the palette sheets on every clock tick or streamed text fragment.
        const stableText =
          !removedElements &&
          !addedElements &&
          parent &&
          parent.textContent !== "" &&
          [...record.removedNodes].some((node) => !!node.textContent) &&
          !parent.closest('[dir="auto"]');
        if (relevant && !stableText) {
          const root = record.target.getRootNode() as StyleRoot;
          if (manager.hasUnreadable(root)) {
            if (record.target instanceof Element) enqueue(record.target);
            else if (record.target instanceof ShadowRoot)
              enqueueRoot(record.target);
          } else {
            if (record.target instanceof Element) enqueue(record.target, false);
            for (const node of record.addedNodes)
              if (node instanceof Element && !own(node)) enqueue(node);
          }
          if (manager.hasStructuralSelectors() || manager.hasUnreadable(root))
            statesDirty = true;
        }
        if (removedElements) {
          for (const node of record.removedNodes)
            if (node instanceof Element && !own(node)) removedRoots.add(node);
          prune = true;
          schedule();
        }
      }
      if (record.type === "characterData") {
        const parent = record.target.parentElement;
        if (parent?.matches("style")) invalidateStyles();
        else if (
          parent &&
          !(
            record.oldValue &&
            record.target.nodeValue &&
            !parent.closest('[dir="auto"]')
          ) &&
          (manager.hasTextSelectors() || parent.closest('[dir="auto"]'))
        ) {
          enqueue(parent, false);
          statesDirty = true;
        }
      }
    }
  });
  const loaded = (event: Event) => {
    if (event.target instanceof HTMLLinkElement) {
      manager.invalidateRemote(event.target.href);
      invalidateStyles();
      enqueue(doc.documentElement);
    }
  };
  const resized = () => {
    for (const root of sheets.keys()) enqueueRoot(root);
  };
  const fontsLoaded = () => {
    // Font loading changes geometry, not color declarations. Container resize
    // observers handle conditional descendants; only size-based roles need a pass.
    for (const element of geometryTargets)
      if (element.isConnected) enqueue(element, false);
  };
  const hashChanged = () => {
    statesDirty = true;
    schedule();
  };
  const shadowAttached = (event: Event) => {
    const host = event.composedPath().find((node) => node instanceof Element);
    if (host instanceof Element) enqueue(host);
  };
  const ready = () => {
    proxyReady = true;
  };
  function stop() {
    active = false;
    observer.disconnect();
    resizeObserver.disconnect();
    containers.clear();
    geometryTargets.clear();
    manager.dispose();
    if (scheduled !== undefined) win.cancelAnimationFrame(scheduled);
    scheduled = undefined;
    if (polling !== undefined) clearInterval(polling);
    polling = undefined;
    doc.removeEventListener("load", loaded, true);
    win.removeEventListener("resize", resized);
    win.removeEventListener("hashchange", hashChanged);
    doc.fonts.removeEventListener("loadingdone", fontsLoaded);
    doc.removeEventListener(CSSOM_CHANGED, invalidateStyles);
    doc.removeEventListener(SHADOW_ATTACHED, shadowAttached);
    doc.removeEventListener(CSSOM_READY, ready);
    doc.dispatchEvent(new Event(CSSOM_DISABLE));
    for (const remove of listeners.values()) remove();
    listeners.clear();
    for (const pair of sheets.values()) {
      pair.palette.remove();
      pair.effects.remove();
    }
    sheets.clear();
    for (const element of originals.keys()) restore(element);
    originals.clear();
    effects.clear();
    cache.clear();
    locations.clear();
    rootElements.clear();
    removedRoots.clear();
    pending.clear();
    scopes.clear();
    walks.length = 0;
    dirtyEffects.clear();
    previous = "";
    stylesDirty = false;
    statesDirty = false;
    prune = false;
    proxyReady = false;
  }
  return {
    apply(theme: Theme | undefined, enabled: boolean) {
      if (!enabled || !theme) {
        stop();
        return;
      }
      const next = JSON.stringify(theme);
      if (active && previous === next) return;
      css = paletteCSS(theme);
      previous = next;
      if (active) {
        for (const pair of sheets.values()) pair.palette.textContent = css;
        return;
      }
      active = true;
      attach(doc);
      doc.addEventListener("load", loaded, true);
      win.addEventListener("resize", resized);
      win.addEventListener("hashchange", hashChanged);
      doc.fonts.addEventListener("loadingdone", fontsLoaded);
      doc.addEventListener(CSSOM_CHANGED, invalidateStyles);
      doc.addEventListener(SHADOW_ATTACHED, shadowAttached);
      doc.addEventListener(CSSOM_READY, ready);
      doc.dispatchEvent(new Event(CSSOM_ENABLE));
      polling = setInterval(() => {
        manager.refresh();
        // A page-world helper may be blocked or unavailable. Full CSSOM text
        // fingerprints still catch declaration edits and adopted-sheet changes.
        if (!proxyReady)
          for (const root of sheets.keys())
            for (const host of root.querySelectorAll("*"))
              if (host.shadowRoot && !sheets.has(host.shadowRoot))
                enqueue(host);
      }, 1000);
      enqueue(doc.documentElement);
      statesDirty = true;
    },
    dispose: stop,
  };
}
