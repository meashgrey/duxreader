import React from "react";
import { createRoot } from "react-dom/client";
import {
  DomUtils,
  Settings,
  UIComponentMessenger,
} from "../../lib/vimium/upstream";
import { useVimiumTheme } from "../../lib/vimium/use-theme";
import { VomnibarModel } from "./model";
import { VimiumIcon } from "../../lib/vimium/icon";
import "../../lib/vimium/vimium.css";
import "./style.css";

let model: VomnibarModel | null = null;
const pending: MessageEvent[] = [];
UIComponentMessenger.init();
UIComponentMessenger.registerHandler((event) => {
  if (!model) {
    pending.push(event);
    return;
  }
  return model.handleMessage(event);
});

function App() {
  useVimiumTheme();
  const [, rerender] = React.useReducer((value: number) => value + 1, 0);
  const modelRef = React.useRef<VomnibarModel | null>(null);
  if (!modelRef.current) modelRef.current = new VomnibarModel(() => rerender());
  const current = modelRef.current;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    void Settings.onLoaded().then(() => DomUtils.injectUserCss());
    model = current;
    current.attach(inputRef.current);
    for (const event of pending.splice(0)) void current.handleMessage(event);
    const focusInput = () => inputRef.current?.focus();
    window.addEventListener("focus", focusInput);
    const hideOnOutsideClick = () => current.hide();
    document.addEventListener("click", hideOnOutsideClick);
    return () => {
      window.removeEventListener("focus", focusInput);
      document.removeEventListener("click", hideOnOutsideClick);
      model = null;
    };
  }, [current]);

  // Keep the keyboard selection inside the visible part of long result lists.
  const revealSelection = React.useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    if (current.selection < 0) {
      list.scrollTop = 0;
      return;
    }
    const item = list.children.item(current.selection);
    if (!item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.bottom > listRect.bottom)
      list.scrollTop += itemRect.bottom - listRect.bottom + 8;
    else if (itemRect.top < listRect.top)
      list.scrollTop -= listRect.top - itemRect.top + 8;
  }, [current]);
  React.useLayoutEffect(revealSelection, [
    revealSelection,
    current.selection,
    current.completions,
  ]);
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(revealSelection);
    observer.observe(list);
    return () => observer.disconnect();
  }, [revealSelection, current.completions]);

  return (
    <div
      className="vomnibar vimium-surface"
      onClick={(event) => {
        event.stopPropagation();
        inputRef.current?.focus();
      }}
    >
      <div className="vomnibar-search">
        <input
          ref={inputRef}
          value={current.inputValue}
          placeholder={current.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label="Vomnibar"
          aria-controls="vomnibar-results"
          aria-activedescendant={
            current.selection >= 0
              ? `vomnibar-option-${current.selection}`
              : undefined
          }
          onChange={(event) => current.onInput(event.target.value)}
          onKeyDown={(event) => void current.onKeyEvent(event)}
          onKeyPress={(event) => void current.onKeyEvent(event)}
        />
      </div>
      {current.completions.length > 0 && (
        <ul
          ref={listRef}
          id="vomnibar-results"
          role="listbox"
          aria-label="Vomnibar results"
        >
          {current.completions.map((completion, index) => (
            <li
              key={index}
              id={`vomnibar-option-${index}`}
              role="option"
              aria-selected={index === current.selection}
              className={index === current.selection ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
            >
              <VimiumIcon name="keyboardReturn" className="completion-icon" />
              <div
                className="completion-content"
                dangerouslySetInnerHTML={{ __html: completion.html }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
