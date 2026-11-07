import { installEngineProxy } from "../lib/engine/proxy-host";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_start",
  world: "MAIN",
  main() {
    installEngineProxy();
  },
});
