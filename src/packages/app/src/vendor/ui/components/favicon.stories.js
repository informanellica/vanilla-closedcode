import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px><div style=color:var(--text-weak);font-size:12px>Head tags are injected for favicon and app icons.`);
import * as mod from "./favicon.js";
const docs = `### Overview
Injects favicon and app icon meta tags for the document head.

Render once near the app root (head management).

### API
- No props.

### Variants and states
- Single configuration.

### Behavior
- Registers link and meta tags via Solid Meta components.

### Accessibility
- Not applicable.

### Theming/tokens
- Not applicable.

`;
export default {
  title: "UI/Favicon",
  id: "components-favicon",
  component: mod.Favicon,
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
      _el$2 = _el$.firstChild;
    _$insert(_el$, _$createComponent(mod.Favicon, {}), _el$2);
    return _el$;
  })()
};