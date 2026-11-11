import type { Theme } from "../theme";
import type { UserEngineRules } from "../inspector/rules";
export function configure(
  theme: Theme,
  readCSS?: (url: string) => Promise<string>,
  userRules?: UserEngineRules,
): void;
export function remove(): void;
