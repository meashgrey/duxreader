import repository from "./repository.mts";
import search from "./search.mts";
import type { SiteRules } from "../types.mts";

export default {
  hostnames: ["github.com", "www.github.com"],
  preserveInline: [...repository, ...search],
} satisfies SiteRules;
