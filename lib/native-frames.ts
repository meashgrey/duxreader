// GitHub renders Markdown Mermaid diagrams in a dedicated viewscreen frame.
// That frame already follows GitHub's own color mode. Applying the desktop
// palette there would recolor the diagram, so leave the whole frame native.
const nativeFrames = [
  {
    hostname: "viewscreen.githubusercontent.com",
    pathname: "/markdown/mermaid",
  },
] as const;

export function isNativeFrame(url: URL): boolean {
  return nativeFrames.some(
    (frame) =>
      url.hostname === frame.hostname && url.pathname === frame.pathname,
  );
}
