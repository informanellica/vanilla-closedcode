import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:16px;align-items:start><div><div style=color:var(--text-weak);font-size:12px>Mark</div></div><div><div style=color:var(--text-weak);font-size:12px>Splash</div></div><div><div style=color:var(--text-weak);font-size:12px>Logo`);

import * as mod from "./logo.js";
const docs = `### Overview
ClosedCode logo assets: mark, splash, and wordmark.

Use Mark for compact spaces, Logo for headers, Splash for hero sections.

### API
- \`Mark\`, \`Splash\`, and \`Logo\` components accept standard SVG props.

### Variants and states
- Multiple logo variants for different contexts.

### Behavior
- Pure SVG rendering.

### Accessibility
- Provide title/aria-label when logos convey meaning.

### Theming/tokens
- Uses theme color tokens via CSS variables.

`;
export default {
  title: "UI/Logo",
  id: "components-logo",
  component: mod.Logo,
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
      _el$3 = _el$2.firstChild,
      _el$4 = _el$2.nextSibling,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$4.nextSibling,
      _el$7 = _el$6.firstChild;
    _$insert(_el$2, _$createComponent(mod.Mark, {}), null);
    _$insert(_el$4, _$createComponent(mod.Splash, {
      style: {
        width: "80px",
        height: "100px"
      }
    }), null);
    _$insert(_el$6, _$createComponent(mod.Logo, {
      style: {
        width: "200px"
      }
    }), null);
    return _el$;
  })()
};