import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { use as _$use } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:6px><div style=font-weight:600>Preview</div><div style=color:var(--text-weak);font-size:12px>Short supporting text.`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span style=text-decoration:underline;cursor:default>Hover me`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style=display:grid;gap:6px><div style=font-weight:600>Mounted inside</div><div style=color:var(--text-weak);font-size:12px>Uses custom mount node.`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div style="padding:16px;border:1px dashed var(--border-weak)">`);
import { createSignal } from "../../../lib/reactivity.js";
import * as mod from "./hover-card.js";
const docs = `### Overview
Hover-triggered card for lightweight previews and metadata.

Use for short summaries; avoid dense interactive controls.

### API
- Required: \`trigger\` element.
- Children render inside the hover card body.

### Variants and states
- None; content and trigger are fully composable.

### Behavior
- Opens on hover/focus over the trigger.

### Accessibility
- TODO: confirm focus and hover intent behavior from Kobalte.

### Theming/tokens
- Uses \`data-component="hover-card-content"\` and slots for styling.

`;
export default {
  title: "UI/HoverCard",
  id: "components-hover-card",
  component: mod.HoverCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  }
};
export const Basic = {
  render: () => _$createComponent(mod.HoverCard, {
    get trigger() {
      return _tmpl$2();
    },
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;
      return _el$;
    }
  })
};
export const InlineMount = {
  render: () => {
    const [mount, setMount] = createSignal(undefined);
    return (() => {
      var _el$5 = _tmpl$4();
      _$use(setMount, _el$5);
      _$insert(_el$5, _$createComponent(mod.HoverCard, {
        get mount() {
          return mount();
        },
        get trigger() {
          return _tmpl$2();
        },
        get children() {
          var _el$6 = _tmpl$3(),
            _el$7 = _el$6.firstChild,
            _el$8 = _el$7.nextSibling;
          return _el$6;
        }
      }));
      return _el$5;
    })();
  }
};