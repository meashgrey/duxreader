import React from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import {
  defaultTheme,
  ENABLED_KEY,
  isTheme,
  SOURCE_KEY,
  SOURCE_MODE_KEY,
  type SourceMode,
  THEME_KEY,
} from "../../lib/theme";
import {
  FilledButton,
  IconButton,
  OutlinedButton,
  TextField,
  Switch,
} from "../../components/material";
import { materialRoles } from "../../lib/material";
import type { MdOutlinedTextField } from "@material/web/textfield/outlined-text-field.js";
import type { MdSwitch } from "@material/web/switch/switch.js";
import { useUIFont } from "../../lib/use-ui-font";
import { installedUIFonts } from "../../lib/ui-font";
import "./style.css";

function App() {
  const [font, selectFont] = useUIFont();
  const [availableFonts, setAvailableFonts] = React.useState<string[]>([]);
  React.useEffect(() => {
    setAvailableFonts(installedUIFonts());
  }, []);
  const [enabled, setEnabled] = React.useState(true);
  const [status, setStatus] = React.useState("connecting");
  const [error, setError] = React.useState("");
  const [theme, setTheme] = React.useState(defaultTheme);
  const [source, setSource] = React.useState("");
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("file");
  const [browserAvailable, setBrowserAvailable] = React.useState(false);
  const [activePath, setActivePath] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [ready, setReady] = React.useState(false);
  const [updated, setUpdated] = React.useState<number>();
  const [formError, setFormError] = React.useState("");
  const [pickerStatus, setPickerStatus] = React.useState("idle");
  const [pickerError, setPickerError] = React.useState("");
  React.useEffect(() => {
    let disposed = false;
    let snapshot: Record<string, unknown> = {};
    let loaded = false;
    let displayedTheme: unknown;
    const keys = [
      ENABLED_KEY,
      SOURCE_KEY,
      SOURCE_MODE_KEY,
      "browserThemeAvailable",
      THEME_KEY,
      "bridgeStatus",
      "bridgeError",
      "activePath",
      "lastApplied",
      "pickerStatus",
      "pickerError",
    ];
    const update = () => {
      const data = snapshot;
      if (disposed) return;
      setSourceMode(data[SOURCE_MODE_KEY] === "browser" ? "browser" : "file");
      setBrowserAvailable(data.browserThemeAvailable === true);
      setPickerStatus(
        typeof data.pickerStatus === "string" ? data.pickerStatus : "idle",
      );
      setPickerError(
        typeof data.pickerError === "string" ? data.pickerError : "",
      );
      setEnabled(data[ENABLED_KEY] !== false);
      setStatus(
        typeof data.bridgeStatus === "string"
          ? data.bridgeStatus
          : "connecting",
      );
      setError(typeof data.bridgeError === "string" ? data.bridgeError : "");
      setSource(typeof data[SOURCE_KEY] === "string" ? data[SOURCE_KEY] : "");
      setActivePath(typeof data.activePath === "string" ? data.activePath : "");
      setUpdated(
        typeof data.lastApplied === "number" ? data.lastApplied : undefined,
      );
      if (data[THEME_KEY] !== displayedTheme) {
        displayedTheme = data[THEME_KEY];
        setTheme(isTheme(data[THEME_KEY]) ? data[THEME_KEY] : defaultTheme);
      }
      setReady(true);
    };
    // Read once, then merge deltas. Metadata updates keep the same theme object,
    // avoiding needless validation, palette state changes, and style recalculation.
    const onChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (disposed || area !== "local") return;
      let relevant = false;
      for (const key of keys) {
        if (key in changes) {
          snapshot[key] = changes[key]?.newValue;
          relevant = true;
        }
      }
      if (loaded && relevant) update();
    };
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local
      .get(keys)
      .then((data) => {
        if (disposed) return;
        // Events received during the initial read take precedence over its snapshot.
        snapshot = { ...data, ...snapshot };
        loaded = true;
        update();
      })
      .catch((error) => {
        if (!disposed)
          setFormError(`Could not load settings: ${String(error)}`);
      });
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  // Keep in-progress edits when unrelated theme or connection updates arrive.
  React.useEffect(() => {
    setDraft(source);
  }, [source]);
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = theme.mode;
    const roles = materialRoles(theme);
    for (const [key, value] of Object.entries(roles)) {
      root.style.setProperty(`--md-sys-color-${key}`, value);
    }
    return () => {
      for (const key of Object.keys(roles))
        root.style.removeProperty(`--md-sys-color-${key}`);
    };
  }, [theme]);

  async function browse() {
    setFormError("");
    try {
      const response = await browser.runtime.sendMessage({ type: "pickFile" });
      if (!response?.ok)
        setFormError(response?.error ?? "Could not open the file chooser.");
    } catch (error) {
      setFormError(String(error));
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const path = draft.trim();
    if (path && !path.startsWith("/") && !path.startsWith("~/")) {
      setFormError("Enter an absolute path or a path starting with ~/.");
      return;
    }
    setFormError("");
    try {
      await browser.storage.local.set({ [SOURCE_KEY]: path });
      // Also retries an unchanged path after the native host has been installed.
      await browser.runtime.sendMessage({ type: "reconnect" });
    } catch (error) {
      setFormError(String(error));
    }
  }

  const live = status === "watching" || status === "following-browser";
  const statusLabel = !enabled
    ? "Paused"
    : live
      ? "Live"
      : status === "disconnected"
        ? "Offline"
        : status === "error"
          ? "Needs attention"
          : !ready || status === "connecting"
            ? "Connecting"
            : "Waiting";
  const selectedPath = source || activePath;
  const fileName = selectedPath.split("/").filter(Boolean).at(-1);
  const visibleError = formError || pickerError || error;

  async function sync() {
    setFormError("");
    try {
      await browser.runtime.sendMessage({ type: "reconnect" });
    } catch (error) {
      setFormError(String(error));
    }
  }

  function changeSource(mode: SourceMode) {
    setFormError("");
    void browser.storage.local
      .set({ [SOURCE_MODE_KEY]: mode })
      .catch((error) => setFormError(String(error)));
  }

  return (
    <main>
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6 4h6a8 8 0 0 1 0 16H6V4Zm4 4v8h2a4 4 0 0 0 0-8h-2Z" />
            </svg>
          </span>
          <h1>Duxreader</h1>
        </div>
        <IconButton
          aria-label="Sync colors"
          title="Sync colors"
          disabled={!ready}
          onClick={() => {
            void sync();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.7 6.3A8 8 0 0 0 4 12H2a10 10 0 0 1 17.1-7.1L22 2v8h-8l3.7-3.7ZM6.3 17.7A8 8 0 0 0 20 12h2A10 10 0 0 1 4.9 19.1L2 22v-8h8l-3.7 3.7Z" />
          </svg>
        </IconButton>
      </header>

      <section className="theme-card" aria-label="Page theming">
        <div className="theme-heading">
          <div>
            <h2>Page colors</h2>
            <p
              className="status"
              data-state={enabled ? status : "paused"}
              role="status"
            >
              <span className="status-dot" aria-hidden="true" />
              {statusLabel}
            </p>
          </div>
          <Switch
            selected={enabled}
            disabled={!ready}
            aria-label="Theme web pages"
            onChange={(event) => {
              void browser.storage.local
                .set({ [ENABLED_KEY]: (event.target as MdSwitch).selected })
                .catch((error) => setFormError(String(error)));
            }}
          />
        </div>
        <div className="palette" aria-label="Current palette">
          {Object.entries(theme.colors).map(([name, color]) => (
            <span
              key={name}
              className="swatch"
              role="img"
              aria-label={`${name}: ${color}`}
              title={`${name}: ${color}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </section>

      <section className="source-section" aria-labelledby="source-heading">
        <h2 id="source-heading" className="section-label">
          Color source
        </h2>
        {browserAvailable && (
          <fieldset className="segmented-control">
            <legend className="visually-hidden">Color source</legend>
            {(
              [
                ["browser", "Pywalfox"],
                ["file", "Theme file"],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="color-source"
                  value={mode}
                  checked={sourceMode === mode}
                  disabled={!ready}
                  onChange={() => changeSource(mode)}
                />
                <span className="segment">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 16.2-4.2-4.2-1.4 1.4L9 19l12-12-1.4-1.4L9 16.2Z" />
                  </svg>
                  {label}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {sourceMode === "browser" ? (
          <div className="source-row">
            <span className="source-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a16 16 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4c.9 1.1 1.5 2.5 1.9 4h-3.8c.4-1.5 1-2.9 1.9-4ZM4.3 10h3.8a18 18 0 0 0 0 4H4.3a8 8 0 0 1 0-4Zm.8 6h3a16 16 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.4-3.6A16 16 0 0 0 8.1 8ZM12 20c-.9-1.1-1.5-2.5-1.9-4h3.8c-.4 1.5-1 2.9-1.9 4Zm2.3-6H9.7a15 15 0 0 1 0-4h4.6a15 15 0 0 1 0 4Zm.2 5.6a16 16 0 0 0 1.4-3.6h3a8 8 0 0 1-4.4 3.6Zm1.4-5.6a18 18 0 0 0 0-4h3.8a8 8 0 0 1 0 4h-3.8Z" />
              </svg>
            </span>
            <div className="source-copy">
              <h3>Browser theme</h3>
              <p>
                {status === "waiting-browser"
                  ? "Apply colors in Pywalfox"
                  : "Follows your browser"}
              </p>
            </div>
            <span className="mode-label">
              {theme.mode === "dark" ? "Dark" : "Light"}
            </span>
          </div>
        ) : (
          <>
            <div className="source-row">
              <span className="source-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Zm10 14H4V8h16v10Z" />
                </svg>
              </span>
              <div className="source-copy">
                <h3 title={selectedPath || undefined}>
                  {fileName || "No file selected"}
                </h3>
                <p>
                  {pickerStatus === "opening"
                    ? "File chooser open…"
                    : pickerStatus === "cancelled"
                      ? "Selection cancelled"
                      : selectedPath
                        ? "Matugen theme"
                        : "Matugen JSON"}
                </p>
              </div>
            </div>
            <FilledButton
              className="choose-file"
              type="button"
              disabled={!ready || pickerStatus === "opening"}
              onClick={() => {
                void browse();
              }}
            >
              {pickerStatus === "opening" ? "Choosing…" : "Choose file"}
            </FilledButton>
            <details className="manual-path">
              <summary>Enter path</summary>
              <form onSubmit={save}>
                <TextField
                  id="source"
                  label="Theme file path"
                  placeholder="~/.config/duxreader/theme.json"
                  value={draft}
                  disabled={!ready}
                  error={!!formError}
                  errorText={formError}
                  onInput={(event) =>
                    setDraft((event.target as MdOutlinedTextField).value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void save(event);
                    }
                  }}
                />
                <OutlinedButton
                  type="button"
                  disabled={!ready}
                  onClick={(event) => {
                    void save(event);
                  }}
                >
                  Apply path
                </OutlinedButton>
              </form>
            </details>
          </>
        )}
      </section>

      {visibleError && (
        <section className="error-notice" role="alert">
          <p>
            {status === "disconnected"
              ? "Bridge unavailable"
              : "Couldn't sync colors"}
          </p>
          <details>
            <summary>Details</summary>
            <p className="error-detail">{visibleError}</p>
          </details>
        </section>
      )}
      <label className="font-setting">
        <span>Font</span>
        <select
          value={font}
          onChange={(event) => {
            void selectFont(event.target.value);
          }}
        >
          <option value="system">System UI</option>
          {font !== "system" && !availableFonts.includes(font) && (
            <option value={font}>{font} (unavailable)</option>
          )}
          {availableFonts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <footer>
        <span>Auto sync</span>
        <span aria-live="polite">
          {updated
            ? `Synced ${new Date(updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Not synced"}
        </span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
