import React from "react";
import { createRoot } from "react-dom/client";
import {
  DomUtils,
  FindModeHistory,
  Settings,
  UIComponentMessenger,
} from "../../lib/vimium/upstream";
import { useVimiumTheme } from "../../lib/vimium/use-theme";
import { VimiumIcon } from "../../lib/vimium/icon";
import "../../lib/vimium/vimium.css";
import "./style.css";

const TIME_TO_WAIT_FOR_IPC_MESSAGES = 17;
const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

interface FindState {
  historyIndex: number;
  partialQuery: string;
  rawQuery: string;
}

let setTextInInput: ((text: string) => void) | null = null;
let activeHandler: ((event: MessageEvent) => void) | null = null;
const pending: MessageEvent[] = [];
UIComponentMessenger.init();
UIComponentMessenger.registerHandler((event) => {
  if (activeHandler) return activeHandler(event);
  pending.push(event);
});

function moveCaretToEnd(input: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function App() {
  useVimiumTheme();
  const [visible, setVisible] = React.useState(false);
  const [text, setText] = React.useState("");
  const [messageName, setMessageName] = React.useState<string | null>(null);
  const [findMode, setFindMode] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState("");
  const inputRef = React.useRef<HTMLSpanElement>(null);
  const findState = React.useRef<FindState>({
    historyIndex: -1,
    partialQuery: "",
    rawQuery: "",
  });

  const focusInput = React.useCallback(() => {
    if (isFirefox) window.focus();
    inputRef.current?.focus();
    if (inputRef.current) moveCaretToEnd(inputRef.current);
  }, []);

  const updateQuery = React.useCallback((query: string) => {
    findState.current.rawQuery = query;
    UIComponentMessenger.postMessage({ name: "search", query });
  }, []);

  React.useEffect(() => {
    setTextInInput = (value: string) => {
      if (!inputRef.current) return;
      inputRef.current.textContent = value;
      moveCaretToEnd(inputRef.current);
    };
    FindModeHistory.init();
    void Settings.onLoaded().then(() => DomUtils.injectUserCss());
    return () => {
      setTextInInput = null;
    };
  }, []);

  React.useEffect(() => {
    const handle = (event: MessageEvent) => {
      const data = event.data as {
        name: string;
        text?: string;
        messageName?: string;
        matchCount?: number;
        showMatchText?: boolean;
        data?: string;
      };
      switch (data.name) {
        case "show":
          setVisible(true);
          setFindMode(false);
          setText(data.text ?? "");
          setMessageName(data.messageName ?? null);
          break;
        case "hidden":
          setVisible(false);
          setText("");
          setMessageName(null);
          break;
        case "showFindMode":
          setFindMode(true);
          setVisible(true);
          setMatchCount("");
          findState.current = {
            historyIndex: -1,
            partialQuery: "",
            rawQuery: "",
          };
          setTimeout(() => {
            if (isFirefox) window.focus();
            focusInput();
          }, TIME_TO_WAIT_FOR_IPC_MESSAGES);
          break;
        case "updateMatchesCount": {
          const count = data.matchCount ?? 0;
          setMatchCount(
            data.showMatchText
              ? count > 0
                ? ` (${count} Match${count === 1 ? "" : "es"})`
                : " (No matches)"
              : "",
          );
          if (isFirefox) focusInput();
          break;
        }
        case "copyToClipboard":
          if (!navigator.clipboard) {
            UIComponentMessenger.postMessage({
              name: "showClipboardUnavailableMessage",
            });
            break;
          }
          setTimeout(async () => {
            const focusedElement = document.activeElement;
            window.focus();
            await navigator.clipboard.writeText(
              (data.data ?? "").replace(/\xa0/g, " "),
            );
            if (focusedElement instanceof HTMLElement) focusedElement.focus();
            window.parent.focus();
            UIComponentMessenger.postMessage({ name: "unfocusIfFocused" });
          }, TIME_TO_WAIT_FOR_IPC_MESSAGES);
          break;
        case "pasteFromClipboard":
          if (!navigator.clipboard) {
            UIComponentMessenger.postMessage({
              name: "showClipboardUnavailableMessage",
            });
            break;
          }
          setTimeout(async () => {
            const focusedElement = document.activeElement;
            window.focus();
            const value = (await navigator.clipboard.readText()).replace(
              /\xa0/g,
              " ",
            );
            if (focusedElement instanceof HTMLElement) focusedElement.focus();
            window.parent.focus();
            UIComponentMessenger.postMessage({
              name: "pasteResponse",
              data: value,
            });
          }, TIME_TO_WAIT_FOR_IPC_MESSAGES);
          break;
      }
    };
    activeHandler = handle;
    for (const event of pending.splice(0)) handle(event);
    return () => {
      activeHandler = null;
    };
  }, [focusInput]);

  React.useEffect(() => {
    const onKeyEvent = (event: KeyboardEvent) => {
      if (!findMode || !inputRef.current) return;
      if (event.type === "keypress" && event.key !== "Enter") return;
      if (event.type === "keydown" && event.key === "Enter") return;
      const input = inputRef.current;
      if (
        (event.key === "Backspace" && (input.textContent ?? "").length === 0) ||
        event.key === "Enter" ||
        event.key === "Escape"
      ) {
        input.blur();
        UIComponentMessenger.postMessage({
          name: "hideFindMode",
          exitEventIsEnter: event.key === "Enter",
          exitEventIsEscape: event.key === "Escape",
        });
      } else if (event.key === "ArrowUp") {
        const query = FindModeHistory.getQuery(
          findState.current.historyIndex + 1,
        );
        if (query) {
          findState.current.historyIndex += 1;
          if (findState.current.historyIndex === 0)
            findState.current.partialQuery = findState.current.rawQuery;
          setTextInInput?.(query);
          updateQuery(query);
        }
      } else if (event.key === "ArrowDown") {
        findState.current.historyIndex = Math.max(
          -1,
          findState.current.historyIndex - 1,
        );
        const query =
          findState.current.historyIndex >= 0
            ? FindModeHistory.getQuery(findState.current.historyIndex)
            : findState.current.partialQuery;
        setTextInInput?.(query);
        updateQuery(query);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKeyEvent);
    document.addEventListener("keypress", onKeyEvent);
    return () => {
      document.removeEventListener("keydown", onKeyEvent);
      document.removeEventListener("keypress", onKeyEvent);
    };
  }, [findMode, updateQuery]);

  return (
    <div
      className={[
        "hud",
        "vimium-surface",
        visible ? "visible" : "hidden",
        findMode ? "hud-find" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-name={messageName ?? undefined}
    >
      {findMode ? (
        <>
          <VimiumIcon name="search" className="hud-find-icon" />
          <span
            ref={inputRef}
            className="hud-find-input"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Find query"
            onInput={(event) => {
              const value = (event.currentTarget.textContent ?? "").replace(
                /\u00a0/g,
                " ",
              );
              updateQuery(value);
            }}
          />
          <span className="hud-match-count">{matchCount}</span>
        </>
      ) : (
        <span className="hud-text">{text}</span>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
