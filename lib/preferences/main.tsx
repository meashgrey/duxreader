import React from "react";
import { createRoot } from "react-dom/client";
import { SectionIcon } from "./icons";
import {
  AppearanceSettings,
  KeyboardSettings,
  NavigationSettings,
  SiteRulesSettings,
  BackupSettings,
} from "./sections";

const sections = [
  ["appearance", "Appearance"],
  ["keyboard", "Keyboard"],
  ["navigation", "Navigation"],
  ["sites", "Site rules"],
  ["backup", "Backup & restore"],
] as const;

function Sidebar() {
  const [active, setActive] = React.useState("appearance");
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-10% 0px -65% 0px", threshold: 0 },
    );
    for (const section of document.querySelectorAll(".settings-section"))
      observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return (
    <aside className="preferences-sidebar">
      <a className="brand" href="#appearance">
        <span className="brand-mark" aria-hidden="true">
          D
        </span>
        Duxreader
      </a>
      <div className="nav-label">Preferences</div>
      <nav aria-label="Settings sections">
        {sections.map(([id, label], index) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active === id ? "location" : undefined}
            onClick={() => setActive(id)}
          >
            <SectionIcon index={index} />
            {label}
          </a>
        ))}
      </nav>
      <a className="commands-link" href="command_listing.html" target="_blank">
        Command reference ↗
      </a>
    </aside>
  );
}

function SaveBar() {
  const button = React.useRef<HTMLButtonElement>(null);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    const save = button.current!;
    const observer = new MutationObserver(() => setDirty(!save.disabled));
    observer.observe(save, { attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, []);
  return (
    <footer className="save-bar">
      <div id="footer-content">
        <div id="footer-help-text">
          <span id="save-state" role="status">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <small>
            <strong id="shortcut-to-save-all" /> to save · <strong>?</strong>{" "}
            for help
          </small>
        </div>
        <div id="footer-save-options">
          <button ref={button} id="save" type="button" disabled>
            No changes
          </button>
        </div>
      </div>
    </footer>
  );
}

function App() {
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    // The controller owns uncontrolled native form fields; React owns layout
    // and Duxreader controls. Wait for the document before loading upstream.
    void (async () => {
      if (document.readyState === "loading")
        await new Promise<void>((resolve) =>
          document.addEventListener("DOMContentLoaded", () => resolve(), {
            once: true,
          }),
        );
      const controller = (await import(
        new URL("options.js", location.href).href
      )) as { initializeOptions(): Promise<void> };
      await controller.initializeOptions();
    })().catch((reason) =>
      setError(`Couldn't load settings: ${String(reason)}`),
    );
  }, []);
  return (
    <>
      <a className="skip-link" href="#appearance">
        Skip to settings
      </a>
      <div id="wrapper" className="preferences-layout">
        <Sidebar />
        <main className="preferences-main">
          <header className="page-header">
            <p className="eyebrow">Duxreader</p>
            <h1>Preferences</h1>
            <p>Appearance and keyboard controls.</p>
          </header>
          {error && <p role="alert">{error}</p>}
          <input type="hidden" name="settingsVersion" />
          <AppearanceSettings />
          <KeyboardSettings />
          <NavigationSettings />
          <SiteRulesSettings />
          <BackupSettings />
          <SaveBar />
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
