import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;gap:12px;align-items:center>`);
import * as mod from "./avatar.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
User avatar with image fallback to initials.

Use in user lists and headers.

### API
- Required: \`fallback\` string.
- Optional: \`src\`, \`background\`, \`foreground\`, \`size\`.

### Variants and states
- Sizes: small, normal, large.
- Image vs fallback state.

### Behavior
- Uses grapheme-aware fallback rendering.

### Accessibility
- TODO: provide alt text when using images; currently image is decorative.

### Theming/tokens
- Uses \`data-component="avatar"\` with size and image state attributes.

`;
const story = create({
  title: "UI/Avatar",
  mod,
  args: {
    fallback: "A"
  }
});
export default {
  title: "UI/Avatar",
  id: "components-avatar",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  },
  argTypes: {
    size: {
      control: "select",
      options: ["small", "normal", "large"]
    }
  }
};
export const Basic = story.Basic;
export const WithImage = {
  args: {
    src: "https://placehold.co/80x80/png",
    fallback: "J"
  }
};
export const Sizes = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.Avatar, {
      size: "small",
      fallback: "S"
    }), null);
    _$insert(_el$, _$createComponent(mod.Avatar, {
      size: "normal",
      fallback: "N"
    }), null);
    _$insert(_el$, _$createComponent(mod.Avatar, {
      size: "large",
      fallback: "L"
    }), null);
    return _el$;
  })()
};
export const CustomColors = {
  args: {
    fallback: "C",
    background: "#1f2a44",
    foreground: "#f2f5ff"
  }
};