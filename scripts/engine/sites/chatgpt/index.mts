import type { SiteRules } from "../types.mts";

// ChatGPT paints user messages with a translucent surface token and a
// separate text token. Recoloring those independently can put light text on a
// light translucent bubble, so keep the bubble and its text on an explicit
// MD3 tonal pair.
export default {
  hostnames: ["chatgpt.com", "www.chatgpt.com", "chat.openai.com"],
  colorMap: [
    {
      selector: ".bg-user-message, .user-message-bubble-color",
      property: "background-color",
      target: "surface",
    },
    {
      selector:
        ".text-user-message, .user-message-bubble-color, [data-markdown-text-tone='user-message']",
      property: "color",
      target: "foreground",
    },
  ],
} satisfies SiteRules;
