import { installEngineProxy } from "../../lib/engine/proxy-host";
interface Renderer {
  apply(theme: any, enabled: boolean): void;
  dispose(): void;
}
export async function benchmark(createRenderer: () => Renderer) {
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const theme = {
    mode: "dark",
    css: "",
    colors: {
      background: "#061003",
      surface: "#293426",
      foreground: "#d3ddcf",
      accent: "#a0cf93",
    },
  };
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>body{background:white;color:#111}section{background:#eee;border:1px solid #999;border-radius:8px}article,span{background:white;color:#111}button:focus + span{background:#eee}</style>`,
  );
  const css = document.createElement("style");
  css.textContent = Array.from(
    { length: 250 },
    (_, i) => `.unused-${i}::before{content:"";color:#111}`,
  ).join("");
  document.head.append(css);
  const main = document.createElement("main");
  for (
    let i = 0;
    i <
    Number(
      document.querySelector<HTMLMetaElement>('[name="bench-cards"]')!.content,
    );
    i++
  ) {
    const card = document.createElement("section");
    card.innerHTML =
      `<button>Focus</button><span>State</span>` +
      Array.from(
        { length: 5 },
        () =>
          `<article><div><span>Content</span><span>Text</span></div></article>`,
      ).join("");
    main.append(card);
  }
  document.body.append(main);
  const nodeCount = main.querySelectorAll("*").length;
  const mode = document.querySelector<HTMLMetaElement>(
    '[name="bench-mode"]',
  )!.content;
  (window as any).chrome ??= {};
  let releaseProxy = () => {};
  if (mode === "normal") releaseProxy = installEngineProxy();
  else {
    // A real, opaque stylesheet exercises the fallback used for failed CDN reads.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      document.querySelector<HTMLMetaElement>('[name="css-origin"]')!.content +
      "/opaque.css";
    await new Promise<void>((resolve) => {
      link.onload = () => resolve();
      document.head.append(link);
    });
  }
  let computed = 0,
    queries = 0,
    visited = 0,
    matches = 0,
    bounds = 0,
    lastActivity = 0;
  let callbacks: number[] = [];
  const outstanding = new Set<number>();
  const measure = (fn: () => void) => {
    const start = performance.now();
    try {
      fn();
    } finally {
      callbacks.push(performance.now() - start);
    }
  };
  const nativeComputed = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((...args: Parameters<typeof getComputedStyle>) => {
    computed++;
    lastActivity = performance.now();
    return nativeComputed(...args);
  }) as typeof getComputedStyle;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    const id = nativeRAF((time) => {
      outstanding.delete(id);
      measure(() => fn(time));
    });
    outstanding.add(id);
    return id;
  };
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  window.cancelAnimationFrame = (id) => {
    outstanding.delete(id);
    nativeCancel(id);
  };
  const nativeInterval = window.setInterval.bind(window);
  const nativeIdle = window.requestIdleCallback?.bind(window);
  if (nativeIdle)
    window.requestIdleCallback = (fn, options) =>
      nativeIdle((deadline) => measure(() => fn(deadline)), options);
  window.setInterval = ((fn: () => void, delay: number) =>
    nativeInterval(() => measure(fn), delay)) as typeof window.setInterval;
  const NativeObserver = MutationObserver;
  window.MutationObserver = class extends NativeObserver {
    constructor(fn: MutationCallback) {
      super((records, observer) => measure(() => fn(records, observer)));
    }
  };
  for (const proto of [
    Element.prototype,
    Document.prototype,
    ShadowRoot.prototype,
  ]) {
    const native = proto.querySelectorAll;
    Object.defineProperty(proto, "querySelectorAll", {
      configurable: true,
      writable: true,
      value: function (this: any, selector: string) {
        queries++;
        lastActivity = performance.now();
        const result = native.call(this, selector);
        visited += result.length;
        return result;
      },
    });
  }
  const nativeMatches = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selector: string) {
    matches++;
    return nativeMatches.call(this, selector);
  } as typeof Element.prototype.matches;
  const nativeBounds = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    bounds++;
    return nativeBounds.call(this);
  };
  const results: any[] = [];
  const reset = () => {
    computed = queries = visited = matches = bounds = 0;
    callbacks = [];
  };
  const quiet = async () => {
    const start = performance.now();
    await sleep(200);
    while (
      (outstanding.size || performance.now() - lastActivity < 120) &&
      performance.now() - start < 20000
    )
      await sleep(30);
    return outstanding.size === 0 && performance.now() - lastActivity >= 120;
  };
  async function phase(name: string, fn: () => Promise<void> | void) {
    reset();
    const start = performance.now();
    await fn();
    const actionWallMs = performance.now() - start;
    const settled = await quiet();
    results.push({
      name,
      actionWallMs,
      wallMs: performance.now() - start,
      settled,
      computed,
      queries,
      visited,
      matches,
      bounds,
      callbackMs: callbacks.reduce((a, b) => a + b, 0),
      maxCallbackMs: Math.max(0, ...callbacks),
      longCallbacks: callbacks.filter((n) => n >= 50).length,
    });
  }
  const renderer = createRenderer();
  await phase("initial", () => renderer.apply(theme, true));
  const leaf = main.querySelector("article span") as HTMLElement;
  await phase("local-style", async () => {
    for (let i = 0; i < 8; i++) {
      leaf.style.color = i % 2 ? "#222" : "#111";
      await sleep(35);
    }
  });
  await phase("pointer-burst", () => {
    for (let i = 0; i < 30; i++)
      leaf.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, composed: true }),
      );
  });
  await phase("focus-burst", () => {
    for (const control of [...main.querySelectorAll("button")].slice(0, 12))
      control.focus();
    (document.activeElement as HTMLElement)?.blur();
  });
  await phase("mutation-burst", () => {
    for (let i = 0; i < 24; i++) {
      const n = document.createElement("span");
      n.textContent = "Added";
      main.append(n);
    }
  });
  await phase("palette", () =>
    renderer.apply(
      { ...theme, colors: { ...theme.colors, background: "#101820" } },
      true,
    ),
  );
  reset();
  const idleStart = performance.now();
  await sleep(1600);
  results.push({
    name: "idle",
    wallMs: performance.now() - idleStart,
    computed,
    queries,
    visited,
    matches,
    bounds,
    callbackMs: callbacks.reduce((a, b) => a + b, 0),
    maxCallbackMs: Math.max(0, ...callbacks),
    longCallbacks: callbacks.filter((n) => n >= 50).length,
  });
  await phase("clock-text", async () => {
    for (let i = 0; i < 8; i++) {
      leaf.textContent = `Tick ${i}`;
      await sleep(35);
    }
  });
  await phase("removal-burst", () => {
    for (const card of [...main.querySelectorAll("section")].slice(0, 24))
      card.remove();
  });
  renderer.dispose();
  releaseProxy();
  return { nodes: nodeCount, userAgent: navigator.userAgent, results };
}
