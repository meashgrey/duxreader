import profile from "./profile.mts";
import header from "./header.mts";
import repository from "./repository.mts";
import search from "./search.mts";
import type { SiteRules } from "../types.mts";

export default {
  hostnames: ["github.com", "www.github.com"],
  colorMap: [...header, ...profile],
  preserveInline: [...repository, ...search],
} satisfies SiteRules;
