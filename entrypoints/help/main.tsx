import React from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import {
  DomUtils,
  Settings,
  UIComponentMessenger,
  allCommands,
  type CommandDefinition,
} from "../../lib/vimium/upstream";
import { useVimiumTheme } from "../../lib/vimium/use-theme";
import { VIMIUM_VERSION } from "../../lib/vimium/version";
import { VimiumIcon } from "../../lib/vimium/icon";
import "../../lib/vimium/vimium.css";
import "./style.css";

interface Row {
  command: CommandDefinition;
  options: string;
  keys: string[];
}

interface HelpData {
  rows: Record<string, Row[]>;
}

const groupLabels: Record<string, string> = {
  navigation: "Navigating the page",
  history: "Navigating history",
  find: "Using find",
  vomnibar: "Using the Vomnibar",
  tabs: "Manipulating tabs",
  misc: "Miscellaneous",
};
const leftGroups = ["navigation", "history", "find"];
const rightGroups = ["vomnibar", "tabs", "misc"];

let activeHandler: ((event: MessageEvent) => void) | null = null;
const pending: MessageEvent[] = [];
// Vimium's normal-mode shortcuts stay available inside the help overlay. The
// upstream content scripts only need a HelpDialogPage.hide() endpoint.
(globalThis as { isVimiumHelpDialogPage?: boolean }).isVimiumHelpDialogPage =
  true;
(globalThis as { HelpDialogPage?: { hide(): void } }).HelpDialogPage = {
  hide: () => UIComponentMessenger.postMessage({ name: "hide" }),
};
// @ts-expect-error Vendored Vimium has no declaration files.
void import("../../vendor/vimium/pages/all_content_scripts.js").catch((error) =>
  console.error("Vimium help mode:", error),
);
UIComponentMessenger.init();
UIComponentMessenger.registerHandler((event) => {
  if (activeHandler) return activeHandler(event);
  pending.push(event);
});

function compareKeys(a: string, b: string) {
  a = a.replace("<", "~");
  b = b.replace("<", "~");
  return a < b ? -1 : b < a ? 1 : 0;
}

function ellipsize(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}

function isAdvancedCommand(command: CommandDefinition, options: string) {
  return (
    command.advanced || (command.name === "reload" && options.includes("hard"))
  );
}

function buildRows(
  commandToOptionsToKeys: Record<string, Record<string, string[]>>,
) {
  const rows: Record<string, Row[]> = {};
  for (const command of allCommands) {
    const variations = commandToOptionsToKeys[command.name] ?? {};
    for (const [options, keys] of Object.entries(variations)) {
      (rows[command.group] ??= []).push({ command, options, keys });
    }
  }
  return rows;
}

function App() {
  useVimiumTheme();
  const [data, setData] = React.useState<HelpData | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const version = browser.runtime.getManifest().version;

  const hide = React.useCallback(() => {
    UIComponentMessenger.postMessage({ name: "hide" });
  }, []);

  React.useEffect(() => {
    const handle = (event: MessageEvent) => {
      switch (event.data?.name) {
        case "hide":
          hide();
          break;
        case "show":
          void (async () => {
            await Settings.onLoaded();
            const stored = await browser.storage.session.get(
              "commandToOptionsToKeys",
            );
            setData({
              rows: buildRows(
                (stored.commandToOptionsToKeys ?? {}) as Record<
                  string,
                  Record<string, string[]>
                >,
              ),
            });
            setShowAdvanced(
              Settings.get("helpDialog_showAdvancedCommands") === true,
            );
          })();
          break;
        case "hidden":
          break;
      }
    };
    activeHandler = handle;
    for (const event of pending.splice(0)) handle(event);
    return () => {
      activeHandler = null;
    };
  }, [hide]);

  React.useEffect(() => {
    void Settings.onLoaded().then(() => DomUtils.injectUserCss());
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hide]);

  const toggleAdvanced = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    void Settings.set("helpDialog_showAdvancedCommands", next);
  };

  const openOptions = () => {
    void browser.runtime.sendMessage({ handler: "openOptionsPageInNewTab" });
  };

  const renderGroup = (group: string) => {
    const rows = data?.rows[group] ?? [];
    return (
      <section className="help-group" key={group}>
        <h2>{groupLabels[group] ?? group}</h2>
        <div className="help-rows">
          {rows.map(({ command, options, keys }, index) => {
            const advanced = isAdvancedCommand(command, options);
            if (advanced && !showAdvanced) return null;
            let description = command.desc;
            let title: string | undefined;
            if (options !== "") {
              const optionsText = ellipsize(options, 40 - command.desc.length);
              description += ` (${optionsText})`;
              if (optionsText !== options)
                title = `${command.desc} (${options})`;
            }
            return (
              <div className="help-row" key={`${command.name}-${index}`}>
                <div className="help-keys">
                  {[...keys].sort(compareKeys).map((key) => (
                    <span className="vimium-key" key={key}>
                      {key}
                    </span>
                  ))}
                </div>
                <div className="help-description" title={title}>
                  {description}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div
      className="help-scrim"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest(".help-dialog")) hide();
      }}
    >
      <main className="help-dialog vimium-surface" aria-label="Vimium help">
        <header className="help-header">
          <h1>
            <span className="help-brand">Vim</span>ium Help
          </h1>
          <nav>
            <button type="button" className="text-button" onClick={openOptions}>
              Options
            </button>
            <a
              className="text-button"
              href="https://github.com/philc/vimium/wiki"
              target="_blank"
              rel="noreferrer"
            >
              Wiki
            </a>
            <button
              type="button"
              className="icon-button"
              aria-label="Close help"
              onClick={hide}
            >
              <VimiumIcon name="close" />
            </button>
          </nav>
        </header>
        <div className="help-divider" />
        <div className="help-columns">
          <div>{leftGroups.map(renderGroup)}</div>
          <div>{rightGroups.map(renderGroup)}</div>
        </div>
        <div className="help-advanced">
          <button
            type="button"
            className="text-button"
            onClick={toggleAdvanced}
          >
            {showAdvanced ? "Hide advanced commands" : "Show advanced commands"}
          </button>
        </div>
        <div className="help-divider" />
        <footer className="help-footer">
          <div>
            Enjoying Vimium?{" "}
            <a
              href="https://chrome.google.com/webstore/detail/vimium/dbepggeogbaibhgnhhndojpepiihcmeb/reviews"
              target="_blank"
              rel="noreferrer"
            >
              Leave us feedback
            </a>
            .<br />
            Found a bug?{" "}
            <a
              href="https://github.com/philc/vimium/issues"
              target="_blank"
              rel="noreferrer"
            >
              Report it here
            </a>
            .
          </div>
          <div className="help-version">
            Duxreader {version}
            <br />
            Vimium {VIMIUM_VERSION}
            <br />
            <a
              href="https://github.com/philc/vimium/blob/master/CHANGELOG.md"
              target="_blank"
              rel="noreferrer"
            >
              What's new?
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
