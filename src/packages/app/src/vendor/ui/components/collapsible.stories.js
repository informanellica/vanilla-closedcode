import { template as _$template } from "../../../lib/reactivity.js";
import { mergeProps as _$mergeProps } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;align-items:center;gap:8px><span>Details`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=color:var(--text-weak);padding-top:8px>Optional details sit here.`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style=display:flex;align-items:center;gap:8px><span>Ghost trigger`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div style=color:var(--text-weak);padding-top:8px>Ghost content.`);
import * as mod from "./collapsible.js";
const docs = `### Overview
Toggleable content region with optional arrow indicator.

Compose \`Collapsible.Trigger\`, \`Collapsible.Content\`, and \`Collapsible.Arrow\`.

### API
- Root accepts Kobalte Collapsible props (\`open\`, \`defaultOpen\`, \`onOpenChange\`).
- \`variant\` controls styling ("normal" | "ghost").

### Variants and states
- Normal and ghost variants.
- Open/closed states.

### Behavior
- Trigger toggles the content visibility.

### Accessibility
- TODO: confirm ARIA attributes provided by Kobalte.

### Theming/tokens
- Uses \`data-component="collapsible"\` and slots for trigger/content/arrow.

`;
export default {
  title: "UI/Collapsible",
  id: "components-collapsible",
  component: mod.Collapsible,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["normal", "ghost"]
    }
  }
};
export const Basic = {
  args: {
    variant: "normal",
    defaultOpen: true
  },
  render: props => _$createComponent(mod.Collapsible, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Collapsible.Trigger, {
        "data-slot": "collapsible-trigger",
        get children() {
          var _el$ = _tmpl$(),
            _el$2 = _el$.firstChild;
          _$insert(_el$, _$createComponent(mod.Collapsible.Arrow, {}), null);
          return _el$;
        }
      }), _$createComponent(mod.Collapsible.Content, {
        "data-slot": "collapsible-content",
        get children() {
          return _tmpl$2();
        }
      })];
    }
  }))
};
export const Ghost = {
  args: {
    variant: "ghost",
    defaultOpen: false
  },
  render: props => _$createComponent(mod.Collapsible, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Collapsible.Trigger, {
        "data-slot": "collapsible-trigger",
        get children() {
          var _el$4 = _tmpl$3(),
            _el$5 = _el$4.firstChild;
          _$insert(_el$4, _$createComponent(mod.Collapsible.Arrow, {}), null);
          return _el$4;
        }
      }), _$createComponent(mod.Collapsible.Content, {
        "data-slot": "collapsible-content",
        get children() {
          return _tmpl$4();
        }
      })];
    }
  }))
};