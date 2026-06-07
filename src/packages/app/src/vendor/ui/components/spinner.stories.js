import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;gap:16px;align-items:center>`);
import * as mod from "./spinner.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Animated loading indicator for inline or page-level loading states.

Use with \`Button\` or in empty states.

### API
- Accepts standard SVG props (class, style).

### Variants and states
- Single default animation style.

### Behavior
- Animation is CSS-driven via data attributes.

### Accessibility
- Use alongside text or aria-live regions to convey loading state.

### Theming/tokens
- Uses \`data-component="spinner"\` for styling hooks.

`;
const story = create({
  title: "UI/Spinner",
  mod
});
export default {
  title: "UI/Spinner",
  id: "components-spinner",
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
export const Sizes = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.Spinner, {
      style: {
        width: "12px",
        height: "12px"
      }
    }), null);
    _$insert(_el$, _$createComponent(mod.Spinner, {
      style: {
        width: "20px",
        height: "20px"
      }
    }), null);
    _$insert(_el$, _$createComponent(mod.Spinner, {
      style: {
        width: "28px",
        height: "28px"
      }
    }), null);
    return _el$;
  })()
};