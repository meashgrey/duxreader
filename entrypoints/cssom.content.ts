import { installEngineProxy } from "../lib/engine/proxy-host";
import { isNativeFrame } from "../lib/native-frames";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_start",
  world: "MAIN",
  main() {
    if (isNativeFrame(new URL(location.href))) return;
    installEngineProxy();
  },
});
