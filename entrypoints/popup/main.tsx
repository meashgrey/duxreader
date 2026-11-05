import React from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { defaultTheme, ENABLED_KEY, isTheme, THEME_KEY } from "../../lib/theme";
import "./style.css";

function App() {
  const [enabled, setEnabled] = React.useState(true);
  const [status, setStatus] = React.useState("Connecting…");
  const [theme, setTheme] = React.useState(defaultTheme);
  React.useEffect(() => {
    const update = async () => {
      const data = await browser.storage.local.get([
        ENABLED_KEY,
        THEME_KEY,
        "bridgeStatus",
      ]);
      setEnabled(data[ENABLED_KEY] !== false);
      setStatus(
        typeof data.bridgeStatus === "string"
          ? data.bridgeStatus
          : "Waiting for the local bridge",
      );
      if (isTheme(data[THEME_KEY])) setTheme(data[THEME_KEY]);
    };
    void update();
    browser.storage.onChanged.addListener(update);
    return () => browser.storage.onChanged.removeListener(update);
  }, []);
  return (
    <main>
      <p className="eyebrow">DESKTOP → WEB</p>
      <h1>Duxreader</h1>
      <p>Bring your desktop palette to the web.</p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            void browser.storage.local.set({
              [ENABLED_KEY]: event.target.checked,
            });
          }}
        />
        Enable page theming
      </label>
      <div className="palette">
        {Object.entries(theme.colors).map(([name, color]) => (
          <span
            key={name}
            title={`${name}: ${color}`}
            style={{ background: color }}
          />
        ))}
      </div>
      <p className="status">Bridge status: {status}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
