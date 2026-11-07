import type { Page } from "@playwright/test";
export interface SiteContext {
  page: Page;
  output: string;
  setEnabled(enabled: boolean): Promise<void>;
}
export interface SiteCase {
  id: string;
  url: string;
  run(context: SiteContext): Promise<Record<string, unknown>>;
}
