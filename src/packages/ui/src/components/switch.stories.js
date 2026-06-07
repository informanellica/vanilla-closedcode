import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:12px>`);
import * as mod from "./switch.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Toggle control for binary settings.

Use in settings panels or forms.

### API
- Uses Kobalte Switch props (\`checked\`, \`defaultChecked\`, \`onChange\`).
- Optional: \`hideLabel\`, \`description\`.
- Children render as the label.

### Variants and states
- Checked/unchecked, disabled states.

### Behavior
- Controlled or uncontrolled usage via Kobalte props.

### Accessibility
- TODO: confirm aria attributes from Kobalte.

### Theming/tokens
- Uses \`data-component="switch"\` and slot attributes.

`;
const story = create({
  title: "UI/Switch",
  mod,
  args: {
    defaultChecked: true,
    children: "Enable notifications"
  }
});
export default {
  title: "UI/Switch",
  id: "components-switch",
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
    _$insert(_el$, _$createComponent(mod.Switch, {
      defaultChecked: true,
      children: "Enabled"
    }), null);
    _$insert(_el$, _$createComponent(mod.Switch, {
      children: "Disabled"
    }), null);
    _$insert(_el$, _$createComponent(mod.Switch, {
      disabled: true,
      children: "Disabled switch"
    }), null);
    _$insert(_el$, _$createComponent(mod.Switch, {
      description: "Optional description",
      children: "With description"
    }), null);
    return _el$;
  })()
};
export const HiddenLabel = {
  args: {
    children: "Hidden label",
    hideLabel: true,
    defaultChecked: true
  }
};