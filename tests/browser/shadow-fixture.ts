import { applyShadowRules } from "../../lib/inspector/shadow-rules";
import { splitShadowSelector } from "../../lib/inspector/shadow-selector";
import { familySelector, selectorFor } from "../../lib/inspector/selector";
import type { UserRule } from "../../lib/inspector/rules";

declare global {
  interface Window {
    __shadowResult?: { ok: boolean; checks: string[]; error?: string };
  }
}

const checks: string[] = [];
const errors: string[] = [];
window.addEventListener("error", (event) =>
  errors.push(String(event.error ?? event.message)),
);

function assert(value: unknown, label: string) {
  if (!value) throw new Error(label);
  checks.push(label);
}

const colors = {
  background: "#111318",
  surface: "#1d2024",
  foreground: "#e1e2e9",
  accent: "#a8c8ff",
};

function rule(
  selector: string,
  declarations = "color:rgb(1, 2, 3)!important;",
): UserRule {
  return {
    kind: "preserve",
    host: "example.com",
    selector,
    declarations,
    createdAt: 1,
  };
}

function run() {
  document.body.innerHTML = `
    <section class="card" id="outer-card"><div id="host-one"></div></section>
    <section class="card" id="other-card"><div id="host-two"></div></section>
    <div id="plain">Plain</div>
  `;
  const first = document.querySelector<HTMLElement>("#host-one")!;
  const second = document.querySelector<HTMLElement>("#host-two")!;
  const firstRoot = first.attachShadow({ mode: "open" });
  const secondRoot = second.attachShadow({ mode: "open" });
  firstRoot.innerHTML = '<span class="badge" id="first-badge">A</span>';
  secondRoot.innerHTML = '<span class="badge" id="second-badge">B</span>';

  // 1. Selectors express the shadow boundary instead of silently flattening.
  const badge = firstRoot.querySelector("#first-badge")!;
  const exact = selectorFor(badge);
  assert(
    exact.includes(">>>"),
    `shadow selectors keep a host chain (got ${JSON.stringify(exact)})`,
  );
  assert(
    exact.endsWith("#first-badge"),
    "the inner part stays scoped to the shadow root",
  );
  const parsed = splitShadowSelector(exact);
  assert(parsed !== null, "the host chain parses back into parts");
  assert(
    parsed!.hosts.length >= 1 && parsed!.inner === "#first-badge",
    "parsing keeps the hosts separate from the inner selector",
  );

  // 2. Family matching stays inside the owning shadow root.
  const family = familySelector(badge);
  const familyParsed = splitShadowSelector(family.selector);
  assert(
    familyParsed !== null,
    `shadow families keep a host chain (got ${JSON.stringify(family.selector)})`,
  );
  assert(
    family.matches.length === 1,
    "families do not leak into a sibling shadow root",
  );

  // 3. Rules are injected into the right shadow root and nowhere else.
  const dispose = applyShadowRules(
    [rule(exact)],
    "example.com",
    colors,
  );
  const stylesIn = (root: ShadowRoot) =>
    root.querySelectorAll("[data-duxreader-shadow-rule]").length;
  assert(stylesIn(firstRoot) === 1, "the owning shadow root receives a style");
  assert(stylesIn(secondRoot) === 0, "other shadow roots stay untouched");
  assert(
    document.querySelectorAll("[data-duxreader-shadow-rule]").length === 0,
    "shadow rules never land in the document",
  );
  assert(
    firstRoot
      .querySelector("[data-duxreader-shadow-rule]")!
      .textContent!.includes("color:rgb(1, 2, 3)"),
    "the injected style carries the preserved declarations",
  );
  dispose();
  assert(
    stylesIn(firstRoot) === 0,
    "disposing removes the injected shadow style",
  );

  // 4. Later shadow hosts are picked up by the observer.
  const lateHost = document.createElement("div");
  lateHost.id = "late-host";
  document.querySelector("#outer-card")!.append(lateHost);
  const lateRoot = lateHost.attachShadow({ mode: "open" });
  lateRoot.innerHTML = '<span class="badge" id="late-badge">C</span>';
  const lateDispose = applyShadowRules(
    [rule("div#late-host >>> #late-badge")],
    "example.com",
    colors,
  );
  assert(stylesIn(lateRoot) === 1, "newly created hosts receive their style");
  lateDispose();

  // 5. Map rules compile with the palette role, not a raw colour.
  const mapDispose = applyShadowRules(
    [
      {
        kind: "map",
        host: "example.com",
        selector: "div#host-one >>> .badge",
        property: "color",
        target: "accent",
        createdAt: 2,
      },
    ],
    "example.com",
    colors,
  );
  const mapStyle = firstRoot.querySelector("[data-duxreader-shadow-rule]")!;
  assert(
    mapStyle.textContent!.includes(".badge{color:#a8c8ff!important;}"),
    "shadow map rules compile against the palette",
  );
  mapDispose();

  // 6. Rules for another site are ignored.
  const otherDispose = applyShadowRules(
    [rule("div#host-one >>> .badge")],
    "other.example",
    colors,
  );
  assert(stylesIn(firstRoot) === 0, "rules stay scoped to their host");
  otherDispose();

  // 7. Plain document rules keep working.
  const plainDispose = applyShadowRules(
    [rule("#plain")],
    "example.com",
    colors,
  );
  assert(
    document.querySelectorAll("[data-duxreader-shadow-rule]").length === 0,
    "light-DOM rules are left to the engine",
  );
  plainDispose();
}

try {
  run();
  window.__shadowResult = { ok: true, checks, error: errors[0] };
} catch (error) {
  window.__shadowResult = { ok: false, checks, error: String(error) };
}
