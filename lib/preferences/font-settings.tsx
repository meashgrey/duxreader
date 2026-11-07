import React from "react";
import { useUIFont } from "../use-ui-font";
import { installedUIFonts } from "../ui-font";

export function FontSettings() {
  const [font, selectFont] = useUIFont();
  const [fonts] = React.useState(installedUIFonts);
  const [status, setStatus] = React.useState("Font changes save automatically");
  async function changeFont(value: string) {
    try {
      await selectFont(value);
      setStatus("Font saved");
    } catch {
      setStatus("Couldn't save font");
    }
  }
  return (
    <div className="settings-card">
      <div className="setting-row">
        <div>
          <label htmlFor="ui-font">Interface font</label>
          <p>Applies to Duxreader and its Vimium overlays.</p>
        </div>
        <select
          id="ui-font"
          value={font}
          onChange={(event) => void changeFont(event.target.value)}
        >
          <option value="system">System UI</option>
          {font !== "system" && !fonts.includes(font) && (
            <option value={font}>{font} (unavailable)</option>
          )}
          {fonts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="appearance-preview" aria-label="Font and theme preview">
        <span className="preview-badge">Preview</span>
        <span className="preview-title">Duxreader</span>
        <span className="preview-caption">
          The quick brown fox jumps over the lazy dog.
        </span>
        <div className="palette-swatches" aria-label="Current palette">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="setting-row">
        <span className="supporting-text">Follows your desktop theme</span>
        <span id="font-status" role="status">
          {status}
        </span>
      </div>
    </div>
  );
}
