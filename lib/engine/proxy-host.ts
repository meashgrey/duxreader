import { injectProxy } from "./proxy.js";

// Both browsers use the upstream dedicated MAIN-world proxy. Do not read the
// event's detail object: Firefox isolates objects created by content scripts.
// The extension always enables both upstream proxy features.
export function installEngineProxy() {
  let active = false;
  const reset = () => {
    active = false;
  };
  const start = () => {
    if (active) return;
    active = true;
    injectProxy(true, true);
  };
  document.addEventListener("__darkreader__cleanUp", reset);
  document.addEventListener("__darkreader__stylesheetProxy__arg", start);
  return () => {
    document.removeEventListener("__darkreader__stylesheetProxy__arg", start);
    document.removeEventListener("__darkreader__cleanUp", reset);
    document.dispatchEvent(new Event("__darkreader__cleanUp"));
  };
}
