import { installCSSOMProxy } from "../lib/rendering/cssom-proxy";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_start",
  world: "MAIN",
  main() {
    installCSSOMProxy();
  },
});
