import profile from "./profile.mts";
import header from "./header.mts";
import feed from "./feed.mts";
import forms from "./forms.mts";
import state from "./state.mts";
import repository from "./repository.mts";
import search from "./search.mts";
import type { SiteRules } from "../types.mts";

export default {
  hostnames: ["github.com", "www.github.com"],
  colorMap: [...header, ...profile, ...feed, ...state, ...forms],
  preserveInline: [...repository, ...search],
} satisfies SiteRules;
