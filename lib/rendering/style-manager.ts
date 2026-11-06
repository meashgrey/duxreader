import { stylesheetImports, type ImportReference } from "./css-imports";
import {
  isStateSelector,
  pseudoHost,
  splitSelectors,
  VariableGraph,
  type AnalyzedRule,
  type Pseudo,
} from "./css-analysis";

export type StyleRoot = Document | ShadowRoot;
export interface StyleChange {
  root: StyleRoot;
  selectors: Set<string>;
  full: boolean;
}
interface SheetRecord {
  sheet: CSSStyleSheet;
  root: StyleRoot;
  key: string;
  rules: AnalyzedRule[];
  selectors: Set<string>;
  media: Set<string>;
  pseudos: Array<{ host: string; pseudo: Pseudo }>;
  states: Set<string>;
  variables: Set<string>;
  unreadable: boolean;
}
const OWN = "data-duxreader-sheet";
const owned = (sheet: CSSStyleSheet) =>
  sheet.ownerNode instanceof Element && sheet.ownerNode.hasAttribute(OWN);

export function createStyleManager(
  doc: Document,
  roots: () => Iterable<StyleRoot>,
  changed: (change: StyleChange) => void,
  options: {
    readCSS?: (url: string) => Promise<string>;
    ready?: () => void;
  } = {},
) {
  const records = new Map<StyleRoot, Map<CSSStyleSheet, SheetRecord>>();
  const media = new Map<
    string,
    { query: MediaQueryList; listener: () => void }
  >();
  const states = new Map<StyleRoot, Map<string, Set<Element>>>();
  const variables = new VariableGraph();
  let revision = 0;
  const remote = new Map<
    string,
    {
      sheet?: CSSStyleSheet;
      imports: ImportReference[];
      version: number;
      attempted: number;
      bytes: number;
      failed: boolean;
    }
  >();
  let epoch = 0,
    remoteBytes = 0;
  function remoteSheet(url: string) {
    let entry = remote.get(url);
    if (!options.readCSS || !/^https?:/.test(url)) return;
    if (entry?.failed && Date.now() - entry.attempted > 60000) {
      remote.delete(url);
      entry = undefined;
    }
    if (!entry && remote.size < 32) {
      entry = {
        imports: [],
        version: 0,
        attempted: Date.now(),
        bytes: 0,
        failed: false,
      };
      remote.set(url, entry);
      const current = epoch,
        target = entry;
      void Promise.resolve()
        .then(() => options.readCSS!(url))
        .then((text) => {
          if (epoch !== current || remote.get(url) !== target) return;
          const size = new TextEncoder().encode(text).length;
          if (size > 2 * 1024 * 1024 || remoteBytes + size > 8 * 1024 * 1024)
            throw new Error("Remote stylesheet budget exceeded");
          const parsed = stylesheetImports(text, url);
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(parsed.css);
          target.bytes = size;
          target.sheet = sheet;
          target.imports = parsed.imports;
          target.version++;
          remoteBytes += size;
          options.ready?.();
        })
        .catch(() => {
          if (epoch === current && remote.get(url) === target) {
            target.failed = true;
            target.version++;
            options.ready?.();
          }
        });
    }
    return entry;
  }
  function sheets(root: StyleRoot) {
    return [
      ...new Set([...root.styleSheets, ...root.adoptedStyleSheets]),
    ].filter((sheet) => !owned(sheet));
  }
  function inspect(sheet: CSSStyleSheet, root: StyleRoot): SheetRecord {
    const texts: string[] = [`${sheet.disabled}:${sheet.media.mediaText}`];
    const found: CSSStyleRule[] = [];
    const nestedDeclarations = new Map<CSSStyleRule, CSSStyleDeclaration[]>();
    const registeredVars = new Set<string>();
    const queries = new Set<string>();
    let unreadable = false;
    const visited = new Set<CSSStyleSheet>();
    const visitedURLs = new Set<string>();
    function readRemote(url: string, depth = 0) {
      if (visitedURLs.has(url)) return;
      visitedURLs.add(url);
      if (depth > 4) {
        unreadable = true;
        return;
      }
      const entry = remoteSheet(url);
      texts.push(`remote:${url}:${entry?.version ?? 0}`);
      if (!entry?.sheet) {
        unreadable = true;
        return;
      }
      rules(entry.sheet.cssRules);
      for (const child of entry.imports) {
        if (child.media) queries.add(child.media);
        readRemote(child.url, depth + 1);
      }
    }
    function walk(source: CSSStyleSheet) {
      if (visited.has(source)) return;
      visited.add(source);
      if (source.media.mediaText) queries.add(source.media.mediaText);
      try {
        rules(source.cssRules);
      } catch {
        if (source.href) readRemote(source.href);
        else unreadable = true;
        texts.push(`unreadable:${source.href}`);
      }
    }
    function rules(list: CSSRuleList) {
      for (const rule of list) {
        texts.push(rule.cssText);
        if (rule instanceof CSSStyleRule) found.push(rule);
        else if ("style" in rule && !rule.cssText.startsWith("@")) {
          let parent: CSSRule | null = rule.parentRule;
          while (parent && !(parent instanceof CSSStyleRule))
            parent = parent.parentRule;
          if (parent instanceof CSSStyleRule) {
            let list = nestedDeclarations.get(parent);
            if (!list) nestedDeclarations.set(parent, (list = []));
            list.push(
              (rule as unknown as { style: CSSStyleDeclaration }).style,
            );
          }
        }
        const registration = /^@property\s+(--[\w-]+)/.exec(rule.cssText);
        if (registration) registeredVars.add(registration[1]!);
        if (rule instanceof CSSMediaRule) queries.add(rule.conditionText);
        if (rule instanceof CSSImportRule && rule.styleSheet) {
          if (rule.media.mediaText) queries.add(rule.media.mediaText);
          walk(rule.styleSheet);
        }
        // CSS nesting, @supports, @layer, @container, and @scope keep their
        // browser-defined cascade. This index only locates affected elements.
        if ("cssRules" in rule) rules((rule as CSSGroupingRule).cssRules);
      }
    }
    walk(sheet);
    const key = texts.join("\n");
    const cached = records.get(root)?.get(sheet);
    if (cached?.key === key) return cached;
    const analyzed: AnalyzedRule[] = [];
    const selectors = new Set<string>(),
      stateSelectors = new Set<string>(),
      varNames = new Set<string>(registeredVars);
    const pseudos: SheetRecord["pseudos"] = [];
    for (const rule of found) {
      const declarations = [
        rule.style,
        ...(nestedDeclarations.get(rule) ?? []),
      ].flatMap((style) =>
        [...style].map((property) => ({
          property,
          value: style.getPropertyValue(property),
        })),
      );

      for (const selector of splitSelectors(rule.selectorText)) {
        analyzed.push({ selector, declarations });
        const target = pseudoHost(selector);
        if (
          !declarations.length ||
          declarations.some((d) => !d.property.startsWith("--"))
        )
          selectors.add(target.host);
        if (target.pseudo)
          pseudos.push({ host: target.host, pseudo: target.pseudo });
        if (isStateSelector(selector)) stateSelectors.add(target.host);
      }
      for (const d of declarations)
        if (d.property.startsWith("--")) varNames.add(d.property);
    }
    return {
      sheet,
      root,
      key,
      rules: analyzed,
      selectors,
      media: queries,
      states: stateSelectors,
      pseudos,
      variables: varNames,
      unreadable,
    };
  }
  type PseudoEntry = { host: string; pseudo: Pseudo };
  const pseudoIndexes = new WeakMap<
    StyleRoot,
    {
      source: Map<CSSStyleSheet, SheetRecord>;
      global: PseudoEntry[];
      keys: Map<string, PseudoEntry[]>;
      unreadable: boolean;
    }
  >();
  function pseudoIndex(root: StyleRoot) {
    const source = records.get(root);
    if (!source) return;
    const cached = pseudoIndexes.get(root);
    if (cached?.source === source) return cached;
    const index = {
      source,
      global: [] as PseudoEntry[],
      keys: new Map<string, PseudoEntry[]>(),
      unreadable: false,
    };
    for (const record of source.values()) {
      index.unreadable ||= record.unreadable;
      for (const entry of record.pseudos) {
        // Only use a required simple selector as a hint; complex selectors keep
        // the full browser matcher so :is(), :not(), and combinators stay safe.
        const hint = /^([.#]?[a-zA-Z_][\w-]*)(?::[\w-]+)*$/.exec(entry.host);
        if (!hint) {
          index.global.push(entry);
          continue;
        }
        const key = /^[.#]/.test(hint[1]!) ? hint[1]! : hint[1]!.toLowerCase();
        let entries = index.keys.get(key);
        if (!entries) index.keys.set(key, (entries = []));
        entries.push(entry);
      }
    }
    pseudoIndexes.set(root, index);
    return index;
  }
  function notifyMedia(query: string) {
    const definitions = new Set<string>();
    for (const map of records.values())
      for (const record of map.values())
        if (record.media.has(query))
          for (const name of record.variables) definitions.add(name);
    const consumers = variables.selectors(definitions);
    for (const [root, map] of records) {
      const selectors = new Set<string>(
        [...consumers].map((s) => pseudoHost(s).host),
      );
      let full = false;
      for (const record of map.values())
        if (record.media.has(query)) {
          for (const selector of record.selectors) selectors.add(selector);
          full ||= record.unreadable;
        }
      if (selectors.size || full) changed({ root, selectors, full });
    }
  }
  return {
    get revision() {
      return revision;
    },
    refresh() {
      const changes = new Map<StyleRoot, StyleChange>();
      const changedVars = new Set<string>();
      const currentRoots = new Set(roots());
      function change(record: SheetRecord) {
        let entry = changes.get(record.root);
        if (!entry)
          changes.set(
            record.root,
            (entry = { root: record.root, selectors: new Set(), full: false }),
          );
        for (const selector of record.selectors) entry.selectors.add(selector);
        for (const name of record.variables) changedVars.add(name);
        entry.full ||= record.unreadable;
      }
      for (const [root, map] of records)
        if (!currentRoots.has(root)) {
          for (const record of map.values()) variables.replace(record);
          records.delete(root);
          states.delete(root);
        }
      for (const root of currentRoots) {
        let map = records.get(root);
        if (!map) records.set(root, (map = new Map()));
        const present = new Set(sheets(root));
        for (const [sheet, old] of map)
          if (!present.has(sheet)) {
            change(old);
            variables.replace(old);
            map.delete(sheet);
          }
        // Reordering changes the cascade even when every rule stays identical.
        const oldOrder = [...map.keys()];
        const newOrder = [...present];
        if (
          oldOrder.length === newOrder.length &&
          oldOrder.some((sheet, i) => sheet !== newOrder[i])
        ) {
          for (const old of map.values()) change(old);
        }
        const ordered = new Map<CSSStyleSheet, SheetRecord>();
        for (const sheet of present) {
          const next = inspect(sheet, root),
            old = map.get(sheet);
          if (next !== old) {
            if (old) {
              change(old);
              variables.replace(old);
            }
            change(next);
            variables.replace(next, next.rules);
          }
          ordered.set(sheet, next);
        }
        if (
          oldOrder.length !== ordered.size ||
          [...ordered].some(
            ([sheet, record], i) =>
              oldOrder[i] !== sheet || map.get(sheet) !== record,
          )
        )
          records.set(root, ordered);
      }
      if (changes.size) {
        revision++;
        variables.rebuild();
        const consumers = variables.selectors(changedVars);
        for (const root of currentRoots) {
          let entry = changes.get(root);
          if (!entry && consumers.size)
            changes.set(
              root,
              (entry = { root, selectors: new Set(), full: false }),
            );
          if (entry)
            for (const selector of consumers)
              entry.selectors.add(pseudoHost(selector).host);
        }
      }
      const queries = new Set(
        [...records.values()].flatMap((map) =>
          [...map.values()].flatMap((r) => [...r.media]),
        ),
      );
      for (const [query, entry] of media)
        if (!queries.has(query)) {
          entry.query.removeEventListener("change", entry.listener);
          media.delete(query);
        }
      for (const query of queries)
        if (!media.has(query)) {
          const listener = () => notifyMedia(query);
          const list = doc.defaultView!.matchMedia(query);
          list.addEventListener("change", listener);
          media.set(query, { query: list, listener });
        }
      for (const entry of changes.values()) {
        pseudoIndexes.delete(entry.root);
        changed(entry);
      }
    },
    pseudoTypes(element: Element): Set<Pseudo> {
      const index = pseudoIndex(element.getRootNode() as StyleRoot),
        result = new Set<Pseudo>();
      if (!index) return result;
      if (index.unreadable) {
        result.add("before");
        result.add("after");
      }
      const candidates = [...index.global];
      for (const key of [
        element.localName,
        `#${element.id}`,
        ...[...element.classList].map((c) => `.${c}`),
      ])
        for (const entry of index.keys.get(key) ?? []) candidates.push(entry);
      for (const entry of candidates) {
        try {
          if (element.matches(entry.host)) result.add(entry.pseudo);
        } catch {
          result.add(entry.pseudo);
        }
      }
      return result;
    },
    hasRelationalSelectors(attribute?: string) {
      for (const map of records.values())
        for (const record of map.values())
          for (const selector of record.states)
            if (
              selector.includes(":has(") &&
              (attribute !== "style" ||
                /\[\s*style\b/i.test(selector) ||
                selector.includes("\\"))
            )
              return true;
      return false;
    },
    hasUnreadable(root: StyleRoot) {
      return [...(records.get(root)?.values() ?? [])].some(
        (record) => record.unreadable,
      );
    },
    hasTextSelectors() {
      for (const map of records.values())
        for (const record of map.values()) {
          if (record.unreadable) return true;
          for (const selector of record.states)
            if (/:(?:empty|dir)\b/.test(selector)) return true;
        }
      return false;
    },
    hasStructuralSelectors() {
      for (const map of records.values())
        for (const record of map.values())
          for (const selector of record.states)
            if (/[+~]|:(?:has|empty|nth-|first-|last-|only-)/.test(selector))
              return true;
      return false;
    },
    stateCandidates(): Set<Element> {
      const result = new Set<Element>();
      for (const [root, map] of records) {
        let previous = states.get(root);
        if (!previous) states.set(root, (previous = new Map()));
        const selectors = new Set(
          [...map.values()].flatMap((record) => [...record.states]),
        );
        for (const [selector, before] of previous)
          if (!selectors.has(selector)) {
            for (const element of before)
              if (element.isConnected) result.add(element);
            previous.delete(selector);
          }
        if ([...map.values()].some((record) => record.unreadable)) {
          if (root instanceof Document) result.add(root.documentElement);
          else for (const child of root.children) result.add(child);
        }
        for (const selector of selectors) {
          let next: Set<Element>;
          try {
            next = new Set(root.querySelectorAll(selector));
          } catch {
            if (root instanceof Document) result.add(root.documentElement);
            else for (const child of root.children) result.add(child);
            continue;
          }
          const before = previous.get(selector);
          for (const element of next)
            if (!before?.has(element)) result.add(element);
          for (const element of before ?? [])
            if (!next.has(element) && element.isConnected) result.add(element);
          previous.set(selector, next);
        }
      }
      return result;
    },
    variableSelectors(names: Iterable<string>) {
      return variables.selectors(names);
    },
    invalidateRemote(url: string) {
      const old = remote.get(url);
      if (old?.sheet) remoteBytes = Math.max(0, remoteBytes - old.bytes);
      remote.delete(url);
    },
    dispose() {
      epoch++;
      remote.clear();
      remoteBytes = 0;
      for (const entry of media.values())
        entry.query.removeEventListener("change", entry.listener);
      media.clear();
      for (const root of records.keys()) pseudoIndexes.delete(root);
      records.clear();
      states.clear();
      variables.clear();
    },
  };
}
