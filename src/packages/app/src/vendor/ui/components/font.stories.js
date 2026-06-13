import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px><div style=font-family:var(--font-family-sans)>ClosedCode Sans Sample</div><div style=font-family:var(--font-family-mono)>ClosedCode Mono Sample`);
import * as mod from "./font.js";
const docs = `### Overview
Uses native system font stacks for sans and mono typography.

Optional compatibility component. Existing roots can keep rendering it, but it does nothing.

### API
- No props.

### Variants and states
- No variants.

### Behavior
- Compatibility wrapper only. No font assets are injected or preloaded.

### Accessibility
- Not applicable.

### Theming/tokens
- Theme tokens come from CSS variables, not this component.

`;
export default {
  title: "UI/Font",
  id: "components-font",
  component: mod.Font,
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
  render: () => (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling;
    _$insert(_el$, _$createComponent(mod.Font, {}), _el$2);
    return _el$;
  })()
};