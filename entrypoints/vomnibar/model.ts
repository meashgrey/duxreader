import { browser } from "wxt/browser";
import {
  KeyboardUtils,
  Settings,
  UIComponentMessenger,
  UrlUtils,
  Utils,
  userSearchEngines,
  type SearchEngine,
  type VomnibarCompletion,
} from "../../lib/vimium/upstream";

interface Activatable {
  completer?: string;
  query?: string;
  newTab?: boolean;
  selectFirst?: boolean;
  keyword?: string | null;
  prefixCount?: number;
}

const message = (payload: object) => browser.runtime.sendMessage(payload);

export class VomnibarModel {
  inputValue = "";
  completions: VomnibarCompletion[] = [];
  selection = -1;
  placeholder = "";
  activeUserSearchEngine: SearchEngine | null = null;
  private completerName = "omni";
  private forceNewTab = false;
  private initialSelectionValue = -1;
  private prefixCount = 1;
  private previousInputValue: string | null = null;
  private seenTabToOpenCompletionList = false;
  private lastRequestId: string | null = null;
  private onHiddenCallback: (() => void) | null = null;
  private input: HTMLInputElement | null = null;

  constructor(private readonly onChange: () => void) {
    this.onKeyEvent = this.onKeyEvent.bind(this);
    this.onInput = this.onInput.bind(this);
  }

  emit() {
    this.onChange();
  }

  attach(input: HTMLInputElement | null) {
    this.input = input;
    input?.focus();
  }

  async handleMessage(event: MessageEvent) {
    switch (event.data?.name) {
      case "hide":
        this.hide();
        break;
      case "hidden":
        this.onHidden();
        break;
      case "activate":
        await this.activate({ ...event.data, name: undefined });
        break;
    }
  }

  private setQuery(query: string) {
    this.inputValue = query;
    if (this.input) this.input.value = query;
  }

  private setCompleterName(name: string) {
    this.completerName = name;
    this.placeholder =
      name === "omni" ? "" : name[0]!.toUpperCase() + name.slice(1);
    this.reset();
  }

  async activate(options: Activatable) {
    await Settings.onLoaded();
    userSearchEngines.set(Settings.get("searchEngines") as string);
    const resolved = {
      completer: "omni",
      query: "",
      newTab: false,
      selectFirst: false,
      keyword: null as string | null,
      prefixCount: 1,
      ...options,
    };
    this.setCompleterName(resolved.completer);
    this.refreshCompletions();
    this.initialSelectionValue = resolved.selectFirst ? 0 : -1;
    this.forceNewTab = resolved.newTab;
    this.setQuery(resolved.query);
    this.prefixCount = resolved.prefixCount;
    this.activeUserSearchEngine = resolved.keyword
      ? (userSearchEngines.keywordToEngine[resolved.keyword] ?? null)
      : null;
    await this.update();
    this.emit();
  }

  reset() {
    this.setQuery("");
    this.completions = [];
    this.previousInputValue = null;
    this.activeUserSearchEngine = null;
    this.selection = this.initialSelectionValue;
    this.seenTabToOpenCompletionList = false;
    this.lastRequestId = null;
    this.emit();
  }

  hide(onHiddenCallback: (() => void) | null = null) {
    this.onHiddenCallback = onHiddenCallback;
    this.input?.blur();
    this.reset();
    // Wait for the iframe to render the empty state so Chrome does not cache
    // the previous visual state.
    setTimeout(() => {
      UIComponentMessenger.postMessage({ name: "hide" });
    }, 0);
  }

  private onHidden() {
    this.onHiddenCallback?.();
    this.onHiddenCallback = null;
    this.reset();
  }

  private updateSelection() {
    const completion = this.completions[this.selection];
    const shouldReplaceInputWithSuggestion =
      this.selection >= 0 && completion?.insertText != null;
    if (shouldReplaceInputWithSuggestion) {
      if (this.previousInputValue == null)
        this.previousInputValue = this.inputValue;
      this.setQuery(completion.insertText!);
    } else if (this.previousInputValue != null) {
      this.setQuery(this.previousInputValue);
      this.previousInputValue = null;
    }
    this.emit();
  }

  private actionFromKeyEvent(event: React.KeyboardEvent<HTMLInputElement>) {
    const key = KeyboardUtils.getKeyChar(event.nativeEvent);
    if (event.type === "keypress" && key !== "enter") return null;
    if (event.type === "keydown" && key === "enter") return null;
    if (KeyboardUtils.isEscape(event.nativeEvent)) return "dismiss";
    if (
      key === "up" ||
      (event.shiftKey && event.key === "Tab") ||
      (event.ctrlKey && (key === "k" || key === "p"))
    )
      return "up";
    if (event.key === "Tab" && !event.shiftKey) return "tab";
    if (key === "down" || (event.ctrlKey && (key === "j" || key === "n")))
      return "down";
    if (event.ctrlKey && key === "enter") return "ctrl-enter";
    if (event.key === "Enter") return "enter";
    if (
      event.key === "Delete" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey
    )
      return "remove";
    if (KeyboardUtils.isBackspace(event.nativeEvent)) return "delete";
    return null;
  }

  async onKeyEvent(event: React.KeyboardEvent<HTMLInputElement>) {
    const action = this.actionFromKeyEvent(event);
    if (!action) return;
    if (action === "dismiss") {
      this.hide();
    } else if (action === "tab" || action === "down") {
      if (
        action === "tab" &&
        this.completerName === "omni" &&
        !this.seenTabToOpenCompletionList &&
        this.inputValue.trim().length === 0
      ) {
        this.seenTabToOpenCompletionList = true;
        await this.update();
      } else if (this.completions.length > 0) {
        this.selection += 1;
        if (this.selection === this.completions.length)
          this.selection = this.initialSelectionValue;
        this.updateSelection();
      }
    } else if (action === "up") {
      this.selection -= 1;
      if (this.selection < this.initialSelectionValue)
        this.selection = this.completions.length - 1;
      this.updateSelection();
    } else if (action === "enter") {
      await this.handleEnterKey(event);
    } else if (action === "ctrl-enter") {
      if (
        !this.activeUserSearchEngine &&
        this.completerName !== "commands" &&
        this.selection >= 0
      ) {
        if (this.previousInputValue == null)
          this.previousInputValue = this.inputValue;
        this.setQuery(this.completions[this.selection]?.url ?? "");
        if (this.input) this.input.scrollLeft = this.input.scrollWidth;
        this.emit();
      }
    } else if (action === "delete") {
      if (this.activeUserSearchEngine && this.input?.selectionEnd === 0) {
        const keyword = this.activeUserSearchEngine.keyword;
        this.setQuery(keyword + this.inputValue.trimStart());
        if (this.input) {
          this.input.selectionStart = this.input.selectionEnd = keyword.length;
        }
        this.activeUserSearchEngine = null;
        await this.update();
      } else if (
        this.seenTabToOpenCompletionList &&
        this.inputValue.trim().length === 0
      ) {
        this.seenTabToOpenCompletionList = false;
        await this.update();
      } else {
        return;
      }
    } else if (action === "remove" && this.selection >= 0) {
      // Upstream currently logs this branch; keep the command behavior stable.
      console.log(this.completions[this.selection]);
    }
    event.stopPropagation();
    event.preventDefault();
  }

  private async handleEnterKey(event: React.KeyboardEvent<HTMLInputElement>) {
    const isPrimarySearchSuggestion = (completion?: VomnibarCompletion) =>
      completion?.isPrimarySuggestion && completion.isCustomSearch;
    let query = this.inputValue.trim();
    const waitingOnCompletions = this.completions.length === 0;
    const completion = this.completions[this.selection];
    const openInNewTab =
      this.forceNewTab ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey;

    if (waitingOnCompletions || this.selection === -1) {
      if (query.length === 0) return;
      if (this.activeUserSearchEngine) {
        query = UrlUtils.createSearchUrl(
          query,
          this.activeUserSearchEngine.url,
        );
        this.hide(() => void this.launchUrl(query, openInNewTab));
        return;
      }
      if (this.completerName !== "omni") return;
      const firstCompletion = this.completions[0];
      if (isPrimarySearchSuggestion(firstCompletion)) {
        query = UrlUtils.createSearchUrl(query, firstCompletion!.searchUrl!);
        await this.launchUrl(query);
      } else if (await UrlUtils.isUrl(query)) {
        this.hide(() => void this.launchUrl(query, openInNewTab));
      } else {
        this.hide(
          () =>
            void message({ handler: "launchSearchQuery", query, openInNewTab }),
        );
      }
    } else if (isPrimarySearchSuggestion(completion)) {
      query = UrlUtils.createSearchUrl(query, completion!.searchUrl!);
      this.hide(() => void this.launchUrl(query, openInNewTab));
    } else if (completion?.command) {
      this.hide(async () => {
        await message({
          handler: "runNormalModeCommand",
          command: (completion.command as { registryEntry: unknown })
            .registryEntry,
          count: this.prefixCount,
        });
      });
    } else if (completion) {
      this.hide(() => this.openCompletion(completion, openInNewTab));
    }
  }

  private getInputValueAsQuery() {
    const prefix = this.activeUserSearchEngine
      ? `${this.activeUserSearchEngine.keyword} `
      : "";
    return prefix + this.inputValue;
  }

  private async updateCompletions() {
    const requestId = Utils.createUniqueId();
    this.lastRequestId = requestId;
    const query = this.getInputValueAsQuery();
    const queryTerms = query
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0);
    const results = (await message({
      handler: "filterCompletions",
      completerName: this.completerName,
      queryTerms,
      query,
      seenTabToOpenCompletionList: this.seenTabToOpenCompletionList,
    })) as VomnibarCompletion[];
    if (this.lastRequestId !== requestId) return;
    this.completions = results.map((completion) => ({
      ...completion,
      html: completionLine(completion.html),
    }));
    this.selection = this.completions[0]?.autoSelect
      ? 0
      : this.initialSelectionValue;
    this.selection = Math.min(
      this.completions.length - 1,
      Math.max(this.initialSelectionValue, this.selection),
    );
    this.updateSelection();
  }

  private refreshCompletions() {
    void message({
      handler: "refreshCompletions",
      completerName: this.completerName,
    });
  }

  private cancelCompletions() {
    void message({
      handler: "cancelCompletions",
      completerName: this.completerName,
    });
  }

  onInput(value: string) {
    this.setQuery(value);
    this.emit();
    this.seenTabToOpenCompletionList = false;
    this.cancelCompletions();
    if (!this.activeUserSearchEngine) {
      const engine = this.getUserSearchEngineForQuery();
      if (engine) {
        this.activeUserSearchEngine = engine;
        this.setQuery(value.trim().split(/\s+/).slice(1).join(" "));
      }
    }
    if (this.previousInputValue != null) {
      this.previousInputValue = null;
      this.selection = -1;
    }
    this.emit();
    void this.update();
  }

  private getUserSearchEngineForQuery() {
    const parts = this.inputValue.trimStart().split(/\s+/);
    if (parts.length <= 1) return null;
    const keyword = parts[0]!;
    return Object.hasOwn(userSearchEngines.keywordToEngine, keyword)
      ? userSearchEngines.keywordToEngine[keyword]!
      : null;
  }

  private async update() {
    await this.updateCompletions();
    this.input?.focus();
    this.emit();
  }

  private openCompletion(
    completion: VomnibarCompletion,
    openInNewTab: boolean,
  ) {
    if (completion.description === "tab") {
      void message({ handler: "selectSpecificTab", id: completion.tabId });
    } else {
      void this.launchUrl(completion.url ?? "", openInNewTab);
    }
  }

  private async launchUrl(url: string, openInNewTab = false) {
    if (openInNewTab && UrlUtils.hasJavascriptProtocol(url))
      openInNewTab = false;
    await message({
      handler: openInNewTab ? "openUrlInNewTab" : "openUrlInCurrentTab",
      url,
    });
  }
}

// Adapt the upstream template once when results arrive, retaining match markup.
function completionLine(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const line = template.content.querySelector(".top-half");
  if (!line) return html;
  for (const source of line.querySelectorAll(".source")) {
    if (source.textContent?.trim() === "↪") source.remove();
    else source.classList.add("completion-type");
  }
  const title = line.querySelector(".title");
  if (title && !title.textContent?.trim()) {
    title.innerHTML = template.content.querySelector(".url")?.innerHTML ?? "";
  }
  return line.outerHTML;
}
