// Official Material Web components, wrapped for typed React property/event binding.
import React from "react";
import { createComponent } from "@lit/react";
import { MdFilledButton } from "@material/web/button/filled-button.js";
import { MdOutlinedButton } from "@material/web/button/outlined-button.js";
import { MdOutlinedTextField } from "@material/web/textfield/outlined-text-field.js";
import { MdSwitch } from "@material/web/switch/switch.js";
import { MdIconButton } from "@material/web/iconbutton/icon-button.js";

export const IconButton = createComponent({
  react: React,
  tagName: "md-icon-button",
  elementClass: MdIconButton,
});

export const FilledButton = createComponent({
  react: React,
  tagName: "md-filled-button",
  elementClass: MdFilledButton,
});
export const OutlinedButton = createComponent({
  react: React,
  tagName: "md-outlined-button",
  elementClass: MdOutlinedButton,
});
export const TextField = createComponent({
  react: React,
  tagName: "md-outlined-text-field",
  elementClass: MdOutlinedTextField,
  events: { onInput: "input" },
});
export const Switch = createComponent({
  react: React,
  tagName: "md-switch",
  elementClass: MdSwitch,
  events: { onChange: "change" },
});
