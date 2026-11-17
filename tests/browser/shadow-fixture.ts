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
  const mapStyle = firstRoot.querySelector<HTMLStyleElement>(
    "[data-duxreader-shadow-rule]",
  )!;
  // The stored selector uses a " >>> " host chain, which is not valid CSS. The
  // injected sheet must contain only the inner selector, and the browser must
  // accept the rule instead of dropping it.
  const mapText = mapStyle.textContent!;
  assert(
    !mapText.includes(">>>"),
    `shadow map rules must not leak the host-chain separator (got ${JSON.stringify(mapText)})`,
  );
  assert(
    mapText.includes(".badge{color:#a8c8ff!important;}"),
    "shadow map rules compile against the palette",
  );
  const mapSheet = mapStyle.sheet!;
  assert(
    mapSheet.cssRules.length === 1,
    `the browser accepts the shadow map rule (parsed ${mapSheet.cssRules.length} rules from ${JSON.stringify(mapText)})`,
  );
  assert(
    mapSheet.cssRules[0]!.cssText.includes(".badge"),
    "the parsed rule targets the inner selector",
  );
  mapDispose();

  // 5b. Two mappings on the same element but different properties must both
  // survive. They share a selector, which is not a unique rule identity.
  const multiDispose = applyShadowRules(
    [
      {
        kind: "map",
        host: "example.com",
        selector: "div#host-one >>> .badge",
        property: "color",
        target: "accent",
        createdAt: 3,
      },
      {
        kind: "map",
        host: "example.com",
        selector: "div#host-one >>> .badge",
        property: "background-color",
        target: "surface",
        createdAt: 4,
      },
    ],
    "example.com",
    colors,
  );
  const multiText = [
    ...firstRoot.querySelectorAll<HTMLStyleElement>(
      "[data-duxreader-shadow-rule]",
    ),
  ]
    .map((node) => node.textContent ?? "")
    .join("\n");
  assert(
    multiText.includes("color:#a8c8ff"),
    `the first property of a shared selector survives (got ${JSON.stringify(multiText)})`,
  );
  assert(
    multiText.includes("background-color:#1d2024"),
    `the second property of a shared selector survives (got ${JSON.stringify(multiText)})`,
  );
  // Shared selectors merge into one CSS rule, so the parsed rule must carry
  // both declarations rather than one rule per stored entry.
  const multiParsed = [
    ...firstRoot.querySelectorAll<HTMLStyleElement>(
      "[data-duxreader-shadow-rule]",
    ),
  ].flatMap((node) => [...(node.sheet?.cssRules ?? [])]);
  assert(
    multiParsed.length === 1,
    `shared selectors merge into one CSS rule (parsed ${multiParsed.length})`,
  );
  const merged = multiParsed[0]!.cssText;
  assert(
    merged.includes("color") && merged.includes("background-color"),
    `the merged rule keeps both properties (got ${JSON.stringify(merged)})`,
  );
  multiDispose();

  // 5c. A preserve rule and a map rule on the same selector must not clobber
  // each other either.
  const mixedDispose = applyShadowRules(
    [
      {
        kind: "map",
        host: "example.com",
        selector: "div#host-one >>> .badge",
        property: "color",
        target: "accent",
        createdAt: 5,
      },
      {
        kind: "preserve",
        host: "example.com",
        selector: "div#host-one >>> .badge",
        declarations: "border-color:rgb(9, 9, 9)!important;",
        createdAt: 6,
      },
    ],
    "example.com",
    colors,
  );
  const mixedText = [
    ...firstRoot.querySelectorAll<HTMLStyleElement>(
      "[data-duxreader-shadow-rule]",
    ),
  ]
    .map((node) => node.textContent ?? "")
    .join("\n");
  assert(
    mixedText.includes("color:#a8c8ff"),
    `a map rule survives next to a preserve rule (got ${JSON.stringify(mixedText)})`,
  );
  assert(
    mixedText.includes("border-color:rgb(9, 9, 9)"),
    `a preserve rule survives next to a map rule (got ${JSON.stringify(mixedText)})`,
  );
  mixedDispose();

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
