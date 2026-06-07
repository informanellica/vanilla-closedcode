import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;gap:8px;align-items:center>`);
import * as mod from "./tag.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Small label tag for metadata and status chips.

Use alongside headings or lists for quick metadata.

### API
- Optional: \`size\` (normal | large).
- Accepts standard span props.

### Variants and states
- Size variants only.

### Behavior
- Inline element; size controls padding and font size via CSS.

### Accessibility
- Ensure text conveys meaning; avoid color-only distinction.

### Theming/tokens
- Uses \`data-component="tag"\` with size data attributes.

`;
const story = create({
  title: "UI/Tag",
  mod,
  args: {
    children: "Tag"
  }
});
export default {
  title: "UI/Tag",
  id: "components-tag",
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
      options: ["normal", "large"]
    }
  }
};
export const Basic = story.Basic;
export const Sizes = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.Tag, {
      size: "normal",
      children: "Normal"
    }), null);
    _$insert(_el$, _$createComponent(mod.Tag, {
      size: "large",
      children: "Large"
    }), null);
    return _el$;
  })()
};