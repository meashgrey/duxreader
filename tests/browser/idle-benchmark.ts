import { installCSSOMProxy } from "../../lib/rendering/cssom-proxy";
import type { Theme } from "../../lib/theme";
interface Renderer {
  apply(theme: Theme, enabled: boolean): void;
  dispose(): void;
}
export async function idleBenchmark(create: () => Renderer) {
  const seconds = Number(
    document.querySelector<HTMLMetaElement>('[name="benchmark-seconds"]')!
      .content,
  );
  const transition = new URL(location.href).searchParams.has("transition");
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>body{background:white;color:#111}div{background:white;color:#111;${transition ? "transition:color 100ms,background-color 100ms" : ""}}</style>`,
  );
  for (let i = 0; i < 400; i++) {
    const node = document.createElement("div");
    node.textContent = "Static page";
    document.body.append(node);
  }
  const release = installCSSOMProxy();
  let reads = 0,
    frames = 0,
    ends = 0;
  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = (...args) => {
    reads++;
    return computed(...args);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      frames++;
      callback(time);
    });
  document.addEventListener("transitionend", () => ends++, true);
  await fetch("/started", { method: "POST" });
  const renderer = create();
  renderer.apply(
    {
      mode: "dark",
      css: "",
      colors: {
        background: "#061003",
        surface: "#293426",
        foreground: "#d3ddcf",
        accent: "#a0cf93",
      },
    },
    true,
  );
  const samples = [];
  let previousReads = 0,
    previousFrames = 0,
    previousEnds = 0;
  for (let i = 0; i < seconds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    samples.push({
      second: i + 1,
      reads: reads - previousReads,
      frames: frames - previousFrames,
      transitionEnds: ends - previousEnds,
    });
    previousReads = reads;
    previousFrames = frames;
    previousEnds = ends;
  }
  renderer.dispose();
  release();
  return { transition, userAgent: navigator.userAgent, samples };
}
