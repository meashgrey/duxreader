import "./firefox-api";
// Vimium upstream is plain JavaScript that installs shared globals and exports
// a few modules. These typed facades keep the React pages on the same protocol
// and utility code as the pinned upstream extension.
import "../../vendor/vimium/lib/types.js";
import "../../vendor/vimium/lib/utils.js";
import "../../vendor/vimium/lib/url_utils.js";
import "../../vendor/vimium/lib/keyboard_utils.js";
import "../../vendor/vimium/lib/dom_utils.js";
import "../../vendor/vimium/lib/settings.js";
import "../../vendor/vimium/lib/find_mode_history.js";
// @ts-expect-error Vendored Vimium has no declaration files.
import * as messengerModule from "../../vendor/vimium/pages/ui_component_messenger.js";
// @ts-expect-error Vendored Vimium has no declaration files.
import * as searchEnginesModule from "../../vendor/vimium/background_scripts/user_search_engines.js";
// @ts-expect-error Vendored Vimium has no declaration files.
import { allCommands as upstreamCommands } from "../../vendor/vimium/background_scripts/all_commands.js";

export interface CommandDefinition {
  name: string;
  desc: string;
  group: string;
  advanced?: boolean;
}

export interface SearchEngine {
  keyword: string;
  url: string;
  description: string;
}

export interface VomnibarCompletion {
  html: string;
  url?: string;
  insertText?: string;
  autoSelect?: boolean;
  description?: string;
  command?: { registryEntry: unknown };
  isPrimarySuggestion?: boolean;
  isCustomSearch?: boolean;
  searchUrl?: string;
  tabId?: number;
}

interface UtilsLike {
  assert(condition: unknown, message: string, data?: unknown): void;
  assertType(spec: Record<string, string>, value: unknown): void;
  createUniqueId(): string;
  setTimeout(callback: () => void, delay: number): number;
}

interface UrlUtilsLike {
  createSearchUrl(query: string, searchUrl: string): string;
  hasJavascriptProtocol(url: string): boolean;
  isUrl(query: string): Promise<boolean>;
}

interface KeyboardUtilsLike {
  getKeyChar(event: KeyboardEvent): string;
  isBackspace(event: KeyboardEvent): boolean;
  isEscape(event: KeyboardEvent): boolean;
}

interface DomUtilsLike {
  injectUserCss(): void;
}

interface SettingsLike {
  onLoaded(): Promise<void>;
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
}

interface FindModeHistoryLike {
  init(): void;
  getQuery(index: number): string;
  addQuery(query: string): Promise<void>;
}

interface MessengerLike {
  init(): void;
  registerHandler(handler: (event: MessageEvent) => unknown): void;
  postMessage(data: unknown): void;
}

const globals = globalThis as typeof globalThis & {
  Utils: UtilsLike;
  UrlUtils: UrlUtilsLike;
  KeyboardUtils: KeyboardUtilsLike;
  DomUtils: DomUtilsLike;
  Settings: SettingsLike;
  FindModeHistory: FindModeHistoryLike;
};

export const Utils = globals.Utils;
export const UrlUtils = globals.UrlUtils;
export const KeyboardUtils = globals.KeyboardUtils;
export const DomUtils = globals.DomUtils;
export const Settings = globals.Settings;
export const FindModeHistory = globals.FindModeHistory;
export const UIComponentMessenger = messengerModule as MessengerLike;
export const userSearchEngines = searchEnginesModule as {
  keywordToEngine: Record<string, SearchEngine>;
  set(searchEngines: string): void;
};
export const allCommands = upstreamCommands as CommandDefinition[];
