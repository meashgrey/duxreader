import type { Theme } from "../theme";
export function configure(
  theme: Theme,
  readCSS?: (url: string) => Promise<string>,
): void;
export function remove(): void;
