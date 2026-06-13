import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:12px>`);

import { Icon } from "./icon.js";
import * as mod from "./checkbox.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Checkbox control for multi-select or agreement inputs.

Use in forms and multi-select lists.

### API
- Uses Kobalte Checkbox props (\`checked\`, \`defaultChecked\`, \`onChange\`).
- Optional: \`hideLabel\`, \`description\`, \`icon\`.
- Children render as the label.

### Variants and states
- Checked/unchecked, indeterminate, disabled (via Kobalte).

### Behavior
- Controlled or uncontrolled usage.

### Accessibility
- TODO: confirm aria attributes from Kobalte.

### Theming/tokens
- Uses \`data-component="checkbox"\` and related slots.

`;
const story = create({
  title: "UI/Checkbox",
  mod,
  args: {
    children: "Checkbox",
    defaultChecked: true
  }
});
export default {
  title: "UI/Checkbox",
  id: "components-checkbox",
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
export const States = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.Checkbox, {
      defaultChecked: true,
      children: "Checked"
    }), null);
    _$insert(_el$, _$createComponent(mod.Checkbox, {
      children: "Unchecked"
    }), null);
    _$insert(_el$, _$createComponent(mod.Checkbox, {
      disabled: true,
      children: "Disabled"
    }), null);
    _$insert(_el$, _$createComponent(mod.Checkbox, {
      description: "Helper text",
      children: "With description"
    }), null);
    return _el$;
  })()
};
export const CustomIcon = {
  render: () => _$createComponent(mod.Checkbox, {
    get icon() {
      return _$createComponent(Icon, {
        name: "check",
        size: "small"
      });
    },
    defaultChecked: true,
    children: "Custom icon"
  })
};
export const HiddenLabel = {
  args: {
    children: "Hidden label",
    hideLabel: true
  }
};