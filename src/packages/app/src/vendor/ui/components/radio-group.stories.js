import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:12px>`);
import * as mod from "./radio-group.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Segmented radio group for choosing a single option.

Use for view toggles or mode selection.

### API
- Required: \`options\`.
- Optional: \`current\`, \`defaultValue\`, \`value\`, \`label\`, \`onSelect\`.
- Optional layout: \`size\`, \`fill\`, \`pad\`.

### Variants and states
- Size variants: small, medium.
- Optional fill and padding behavior.

### Behavior
- Maps options to segmented items and manages selection.

### Accessibility
- TODO: confirm role/aria attributes from Kobalte SegmentedControl.

### Theming/tokens
- Uses \`data-component="radio-group"\` with size/pad data attributes.

`;
const story = create({
  title: "UI/RadioGroup",
  mod,
  args: {
    options: ["One", "Two", "Three"],
    defaultValue: "One"
  }
});
export default {
  title: "UI/RadioGroup",
  id: "components-radio-group",
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
      options: ["small", "medium"]
    },
    pad: {
      control: "select",
      options: ["none", "normal"]
    },
    fill: {
      control: "boolean"
    }
  }
};
export const Basic = story.Basic;
export const Sizes = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.RadioGroup, {
      options: ["One", "Two"],
      defaultValue: "One",
      size: "small"
    }), null);
    _$insert(_el$, _$createComponent(mod.RadioGroup, {
      options: ["One", "Two"],
      defaultValue: "One",
      size: "medium"
    }), null);
    return _el$;
  })()
};
export const Filled = {
  args: {
    fill: true,
    pad: "none"
  }
};
export const CustomLabels = {
  render: () => _$createComponent(mod.RadioGroup, {
    options: ["list", "grid"],
    defaultValue: "list",
    label: value => value === "list" ? "List view" : "Grid view"
  })
};