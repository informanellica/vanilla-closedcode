import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;gap:12px;align-items:center>`);
import * as mod from "./icon-button.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Compact icon-only button with size and variant control.

Use \`Button\` for text labels and primary actions.

### API
- Required: \`icon\` icon name.
- Optional: \`size\`, \`iconSize\`, \`variant\`.
- Inherits Kobalte Button props and native button attributes.

### Variants and states
- Variants: primary, secondary, ghost.
- Sizes: small, normal, large.

### Behavior
- Icon size adapts to button size unless overridden.

### Accessibility
- Provide \`aria-label\` when there is no visible text.

### Theming/tokens
- Uses \`data-component="icon-button"\` and size/variant data attributes.

`;
const story = create({
  title: "UI/IconButton",
  mod,
  args: {
    icon: "check",
    "aria-label": "Icon"
  }
});
export default {
  title: "UI/IconButton",
  id: "components-icon-button",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Basic = story.Basic;
export const Sizes = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.IconButton, {
      icon: "check",
      size: "small",
      "aria-label": "Small"
    }), null);
    _$insert(_el$, _$createComponent(mod.IconButton, {
      icon: "check",
      size: "normal",
      "aria-label": "Normal"
    }), null);
    _$insert(_el$, _$createComponent(mod.IconButton, {
      icon: "check",
      size: "large",
      "aria-label": "Large"
    }), null);
    return _el$;
  })()
};
export const Variants = {
  render: () => (() => {
    var _el$2 = _tmpl$();
    _$insert(_el$2, _$createComponent(mod.IconButton, {
      icon: "check",
      variant: "primary",
      "aria-label": "Primary"
    }), null);
    _$insert(_el$2, _$createComponent(mod.IconButton, {
      icon: "check",
      variant: "secondary",
      "aria-label": "Secondary"
    }), null);
    _$insert(_el$2, _$createComponent(mod.IconButton, {
      icon: "check",
      variant: "ghost",
      "aria-label": "Ghost"
    }), null);
    return _el$2;
  })()
};
export const IconSizeOverride = {
  render: () => (() => {
    var _el$3 = _tmpl$();
    _$insert(_el$3, _$createComponent(mod.IconButton, {
      icon: "check",
      size: "small",
      iconSize: "large",
      "aria-label": "Small with large icon"
    }), null);
    _$insert(_el$3, _$createComponent(mod.IconButton, {
      icon: "check",
      size: "large",
      iconSize: "small",
      "aria-label": "Large with small icon"
    }), null);
    return _el$3;
  })()
};