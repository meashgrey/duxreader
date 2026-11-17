import React from "react";
import { browser } from "wxt/browser";
import {
  readUserRules,
  removeUserRule,
  USER_RULES_KEY,
  userRuleKey,
  type UserRule,
} from "../../lib/inspector/rules";

interface HostGroup {
  host: string;
  rules: UserRule[];
}

function groupByHost(rules: readonly UserRule[]): HostGroup[] {
  const groups = new Map<string, UserRule[]>();
  for (const rule of rules) {
    const group = groups.get(rule.host) ?? [];
    group.push(rule);
    groups.set(rule.host, group);
  }
  return [...groups.entries()]
    .map(([host, list]) => ({
      host,
      rules: [...list].sort((left, right) => left.createdAt - right.createdAt),
    }))
    .sort((left, right) => {
      if (right.rules.length !== left.rules.length)
        return right.rules.length - left.rules.length;
      return left.host.localeCompare(right.host);
    });
}

function ruleLabel(rule: UserRule) {
  if (rule.kind === "map") return `${rule.property} → ${rule.target}`;
  return rule.selector.includes(" >>> ")
    ? "Preserve colors (inside shadow DOM)"
    : "Preserve colors";
}

const EXPORT_VERSION = 1;

interface ExportPayload {
  version: number;
  exportedAt: string;
  userSiteRules: readonly UserRule[];
}

function readImport(text: string): UserRule[] {
  const parsed: unknown = JSON.parse(text);
  // Accept both the wrapped export format and a bare rule array so users can
  // paste the "Copy for agent" payload straight back in.
  const candidate = Array.isArray(parsed)
    ? parsed
    : (parsed as { userSiteRules?: unknown })?.userSiteRules;
  return readUserRules(candidate);
}

/**
 * Site rules live in local storage, which is lost when a browser profile is
 * reset. This section makes them inspectable across sites and portable.
 */
export function CustomRulesSettings() {
  const [rules, setRules] = React.useState<UserRule[]>([]);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let disposed = false;
    const load = (value: unknown) => {
      if (disposed) return;
      setRules(readUserRules(value));
    };
    void browser.storage.local
      .get(USER_RULES_KEY)
      .then((state) => load(state[USER_RULES_KEY]));
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && USER_RULES_KEY in changes)
        load(changes[USER_RULES_KEY]?.newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const groups = React.useMemo(() => groupByHost(rules), [rules]);

  async function save(next: readonly UserRule[]) {
    setError("");
    try {
      await browser.storage.local.set({ [USER_RULES_KEY]: next });
    } catch (reason) {
      setError(String(reason));
    }
  }

  function exportRules() {
    setError("");
    const payload: ExportPayload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      userSiteRules: rules,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "duxreader-site-rules.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${rules.length} rule${rules.length === 1 ? "" : "s"}`);
  }

  async function importRules(file: File) {
    setError("");
    setStatus("");
    try {
      const imported = readImport(await file.text());
      if (imported.length === 0) {
        setError("That file has no Duxreader site rules.");
        return;
      }
      // Merge, preferring the imported copy for identical selectors.
      const merged = new Map(rules.map((rule) => [userRuleKey(rule), rule]));
      for (const rule of imported) merged.set(userRuleKey(rule), rule);
      const next = [...merged.values()];
      await save(next);
      setStatus(
        `Imported ${imported.length} rule${imported.length === 1 ? "" : "s"}`,
      );
    } catch (reason) {
      setError(`Couldn't read that file: ${String(reason)}`);
    }
  }

  return (
    <section
      className="settings-section"
      id="custom-rules"
      aria-labelledby="custom-rules-heading"
    >
      <h2 id="custom-rules-heading">Custom rules</h2>
      <div className="settings-card">
        <div className="setting-row">
          <div>
            <span className="setting-label">All sites</span>
            <p>
              {rules.length === 0
                ? "Rules you create with the element picker appear here."
                : `${rules.length} rule${rules.length === 1 ? "" : "s"} across ${groups.length} site${groups.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="rules-actions">
            <button
              type="button"
              className="tonal-button"
              disabled={rules.length === 0}
              onClick={exportRules}
            >
              Export
            </button>
            <button
              type="button"
              className="tonal-button"
              onClick={() => fileInput.current?.click()}
            >
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importRules(file);
              }}
            />
          </div>
        </div>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
        {groups.map((group) => (
          <details key={group.host} className="custom-rules-group">
            <summary>
              <span>{group.host}</span>
              <small>
                {group.rules.length} rule{group.rules.length === 1 ? "" : "s"}
              </small>
            </summary>
            <ul>
              {group.rules.map((rule) => (
                <li key={userRuleKey(rule)}>
                  <div>
                    <code>{rule.selector}</code>
                    <span>{ruleLabel(rule)}</span>
                  </div>
                  <button
                    type="button"
                    className="tonal-button"
                    onClick={() =>
                      void save(removeUserRule(rules, rule))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
