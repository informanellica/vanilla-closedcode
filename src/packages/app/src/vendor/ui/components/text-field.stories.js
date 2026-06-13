import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:12px;width:320px>`);
import * as mod from "./text-field.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Text input with label, description, and optional copy-to-clipboard action.

Pair with \`Tooltip\` and \`IconButton\` for copy affordance (built in).

### API
- Supports Kobalte TextField props: \`value\`, \`defaultValue\`, \`onChange\`, \`disabled\`, \`readOnly\`.
- Optional: \`label\`, \`description\`, \`error\`, \`variant\`, \`copyable\`, \`multiline\`.

### Variants and states
- Normal and ghost variants.
- Supports multiline textarea.

### Behavior
- When \`copyable\` is true, clicking copies the current value.

### Accessibility
- Label is hidden when \`hideLabel\` is true (sr-only).

### Theming/tokens
- Uses \`data-component="input"\` with slot attributes for styling.

`;
const story = create({
  title: "UI/TextField",
  mod,
  args: {
    label: "Label",
    placeholder: "Type here...",
    defaultValue: "Hello"
  }
});
export default {
  title: "UI/TextField",
  id: "components-text-field",
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
export const Variants = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.TextField, {
      label: "Normal",
      placeholder: "Type here...",
      defaultValue: "Value"
    }), null);
    _$insert(_el$, _$createComponent(mod.TextField, {
      label: "Ghost",
      variant: "ghost",
      placeholder: "Type here...",
      defaultValue: "Value"
    }), null);
    return _el$;
  })()
};
export const Multiline = {
  args: {
    label: "Description",
    multiline: true,
    defaultValue: "Line one\nLine two"
  }
};
export const Copyable = {
  args: {
    label: "Invite link",
    defaultValue: "https://example.com/invite/abc",
    copyable: true,
    copyKind: "link"
  }
};
export const Error = {
  args: {
    label: "Email",
    defaultValue: "invalid@",
    error: "Enter a valid email address"
  }
};
export const Disabled = {
  args: {
    label: "Disabled",
    defaultValue: "Readonly",
    disabled: true
  }
};
export const ReadOnly = {
  args: {
    label: "Read only",
    defaultValue: "Read only value",
    readOnly: true
  }
};
export const HiddenLabel = {
  args: {
    label: "Hidden label",
    hideLabel: true,
    placeholder: "Hidden label"
  }
};