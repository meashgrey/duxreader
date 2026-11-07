import React from "react";
import { FontSettings } from "./font-settings";

export const AppearanceSettings = React.memo(function AppearanceSettings() {
  return (
    <section
      className="settings-section"
      id="appearance"
      aria-labelledby="appearance-heading"
    >
      <h2 id="appearance-heading">Appearance</h2>
      <FontSettings />
      <div className="settings-card field-card">
        <div className="field-heading">
          <label htmlFor="hint-css">Custom Vimium CSS</label>
          <a
            className="reference-link"
            href="https://github.com/philc/vimium/wiki/Customizing-Link-Hints"
            target="_blank"
            rel="noreferrer"
          >
            Reference ↗
          </a>
        </div>
        <div>
          <textarea
            id="hint-css"
            name="userDefinedLinkHintCss"
            className="code"
            spellCheck={false}
            rows={7}
          ></textarea>
          <div className="example reset-link">
            <a href="#">Reset</a>
          </div>
        </div>
        <p className="supporting-text">
          Styles for link hints, the Vomnibar, help, exclusions and HUD.
        </p>
      </div>
      <div className="settings-card">
        <label className="setting-row toggle-row">
          <span>Hide HUD in insert mode</span>
          <input name="hideHud" type="checkbox" role="switch" />
        </label>
        <label className="setting-row toggle-row">
          <span>Hide update notifications</span>
          <input name="hideUpdateNotifications" type="checkbox" role="switch" />
        </label>
      </div>
    </section>
  );
});

export const KeyboardSettings = React.memo(function KeyboardSettings() {
  return (
    <section
      className="settings-section"
      id="keyboard"
      aria-labelledby="keyboard-heading"
    >
      <h2 id="keyboard-heading">Keyboard</h2>
      <div className="settings-card field-card">
        <div className="field-heading">
          <label htmlFor="key-mappings">Custom key mappings</label>
          <a
            className="reference-link"
            href="command_listing.html"
            target="_blank"
          >
            All commands ↗
          </a>
        </div>
        <textarea
          id="key-mappings"
          name="keyMappings"
          spellCheck={false}
          rows={7}
        ></textarea>
        <details className="field-help">
          <summary>Mapping syntax</summary>
          <pre id="exampleKeyMapping">
            map j scrollDown map z2 setZoom level=2 unmap j unmapAll " this is a
            comment # this is also a comment
          </pre>
        </details>
      </div>
      <div className="settings-card">
        <label className="setting-row toggle-row">
          <span>
            Ignore keyboard layout<small>Use the en-US QWERTY layout.</small>
          </span>
          <input name="ignoreKeyboardLayout" type="checkbox" role="switch" />
        </label>
      </div>
      <h3>Link hints</h3>
      <div className="settings-card">
        <div className="setting-row" id="link-hint-characters-container">
          <label htmlFor="hint-characters">Hint characters</label>
          <div className="link-hint-characters-field">
            <input id="hint-characters" name="linkHintCharacters" type="text" />
            <div className="example reset-link">
              <a href="#">Reset</a>
            </div>
          </div>
        </div>
        <div className="setting-row" id="link-hint-numbers-container">
          <label htmlFor="hint-numbers">Hint numbers</label>
          <div className="link-hint-characters-field">
            <input id="hint-numbers" name="linkHintNumbers" type="text" />
            <div className="example reset-link">
              <a href="#">Reset</a>
            </div>
          </div>
        </div>
        <label className="setting-row toggle-row">
          <span>
            Filter hints by link text
            <small>Type a link's name to select it.</small>
          </span>
          <input name="filterLinkHints" type="checkbox" role="switch" />
        </label>
        <div id="wait-for-enter">
          <label className="setting-row toggle-row">
            <span>Require Enter for filtered hints</span>
            <input
              name="waitForEnterForFilteredHints"
              type="checkbox"
              role="switch"
            />
          </label>
        </div>
      </div>
    </section>
  );
});

export const NavigationSettings = React.memo(function NavigationSettings() {
  return (
    <section
      className="settings-section"
      id="navigation"
      aria-labelledby="navigation-heading"
    >
      <h2 id="navigation-heading">Navigation</h2>
      <div className="settings-card field-card">
        <label htmlFor="search-engines">Custom search engines</label>
        <textarea
          id="search-engines"
          name="searchEngines"
          spellCheck={false}
          rows={5}
        ></textarea>
        <details className="field-help">
          <summary>Search syntax</summary>
          <pre>
            a: https://example.com/?q=%s Description " this is a comment # this
            is also a comment
          </pre>
          <p>
            <code>%s</code> is replaced by your search terms.
            <a href="doc_search_completion.html" target="_blank">
              Search completion ↗
            </a>
          </p>
        </details>
      </div>
      <h3>New tabs</h3>
      <div className="settings-card" id="new-tab-url-container">
        <label className="setting-row radio-row">
          <input
            id="vimiumNewTabPage"
            type="radio"
            name="newTabDestination"
            value="vimiumNewTabPage"
          />
          <span>Vimium blank page</span>
        </label>
        <div id="openVomnibarContainer">
          <label className="setting-row toggle-row nested-row">
            <span>Open Vomnibar on load</span>
            <input
              id="openVomnibarOnNewTabPage"
              type="checkbox"
              name="openVomnibarOnNewTabPage"
              role="switch"
            />
          </label>
        </div>
        <label className="setting-row radio-row">
          <input
            id="browserNewTabPage"
            type="radio"
            name="newTabDestination"
            value="browserNewTabPage"
          />
          <span>Browser default</span>
        </label>
        <label className="setting-row radio-row">
          <input
            id="customUrl"
            type="radio"
            name="newTabDestination"
            value="customUrl"
          />
          <span>Custom URL</span>
        </label>
        <div className="custom-url-field">
          <input
            type="text"
            name="newTabCustomUrl"
            aria-label="Custom new tab URL"
            placeholder="https://"
            style={{ display: "none" }}
          />
        </div>
      </div>
      <p className="section-note">
        Used by Vimium's create-new-tab command.
        <a
          href="https://github.com/philc/vimium/blob/master/README.md#how-to-allow-vimium-to-work-on-new-tab-pages"
          target="_blank"
          rel="noreferrer"
        >
          New tab setup ↗
        </a>
      </p>
      <h3>Page behavior</h3>
      <div className="settings-card">
        <div className="setting-row">
          <label htmlFor="scroll-step">
            Scroll step<small>Distance for j / k / h / l.</small>
          </label>
          <div className="input-unit">
            <input id="scroll-step" name="scrollStepSize" type="number" />
            <span>px</span>
          </div>
        </div>
        <label className="setting-row toggle-row">
          <span>Smooth scrolling</span>
          <input name="smoothScroll" type="checkbox" role="switch" />
        </label>
        <label className="setting-row toggle-row">
          <span>Prevent pages from stealing focus</span>
          <input name="grabBackFocus" type="checkbox" role="switch" />
        </label>
        <label className="setting-row toggle-row">
          <span>
            Use regular expressions in Find
            <small>
              Use <code>\R</code> to switch to plain text.
            </small>
          </span>
          <input name="regexFindMode" type="checkbox" role="switch" />
        </label>
      </div>
      <div className="settings-card field-card">
        <label htmlFor="previous-patterns">Previous-page patterns</label>
        <div>
          <input id="previous-patterns" name="previousPatterns" type="text" />
          <div className="example reset-link">
            <a href="#">Reset</a>
          </div>
        </div>
        <label htmlFor="next-patterns">Next-page patterns</label>
        <div>
          <input id="next-patterns" name="nextPatterns" type="text" />
          <div className="example reset-link">
            <a href="#">Reset</a>
          </div>
        </div>
      </div>
    </section>
  );
});

export const SiteRulesSettings = React.memo(function SiteRulesSettings() {
  return (
    <section
      className="settings-section"
      id="sites"
      aria-labelledby="sites-heading"
    >
      <h2 id="sites-heading">Site rules</h2>
      <p className="section-note">
        Choose where Vimium shortcuts are disabled. These rules affect keyboard
        navigation.
      </p>
      <div className="settings-card field-card">
        <div id="exclusion-scroll-box">
          <table id="exclusion-rules">
            <tr>
              <th scope="col">URL pattern</th>
              <th scope="col">Excluded keys</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </table>
        </div>
        <button
          id="exclusion-add-button"
          className="tonal-button"
          type="button"
        >
          Add rule
        </button>
        <details className="field-help">
          <summary>Pattern syntax</summary>
          <p>
            Use <code>*</code> to match any characters. Leave keys empty to
            disable all Vimium keys on a matching URL.
          </p>
        </details>
      </div>
    </section>
  );
});

export const BackupSettings = React.memo(function BackupSettings() {
  return (
    <section
      className="settings-section"
      id="backup"
      aria-labelledby="backup-heading"
    >
      <h2 id="backup-heading">Backup &amp; restore</h2>
      <div className="settings-card">
        <div className="setting-row">
          <div>
            <span className="setting-label">Export settings</span>
            <p>Save a copy of your Vimium configuration.</p>
          </div>
          <a
            id="download-backup"
            className="tonal-button"
            download="vimium-options.json"
            href="#"
          >
            Download
          </a>
        </div>
        <div className="setting-row restore-row">
          <label htmlFor="upload-backup">
            Restore settings<small>Import a Vimium JSON backup.</small>
          </label>
          <input id="upload-backup" type="file" accept=".json" />
        </div>
      </div>
    </section>
  );
});
