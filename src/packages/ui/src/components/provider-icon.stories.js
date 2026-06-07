import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill, minmax(80px, 1fr))">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=display:grid;gap:6px;justify-items:center><div style=font-size:10px;color:var(--text-weak);text-align:center>`);
import { iconNames } from "./provider-icons/types.js";
import * as mod from "./provider-icon.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Provider icon sprite renderer for model/provider badges.

Use in model pickers or provider lists.

### API
- Required: \`id\` (provider icon name).
- Accepts standard SVG props.

### Variants and states
- Single visual style; size via CSS.

### Behavior
- Renders from the provider SVG sprite sheet.

### Accessibility
- Provide accessible text nearby when the icon conveys meaning.

### Theming/tokens
- Uses \`data-component="provider-icon"\`.

`;
const story = create({
  title: "UI/ProviderIcon",
  mod,
  args: {
    id: "openai"
  }
});
export default {
  title: "UI/ProviderIcon",
  id: "components-provider-icon",
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
    id: {
      control: "select",
      options: iconNames
    }
  }
};
export const Basic = story.Basic;
export const AllIcons = {
  render: () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, () => iconNames.map(id => (() => {
      var _el$2 = _tmpl$2(),
        _el$3 = _el$2.firstChild;
      _$insert(_el$2, _$createComponent(mod.ProviderIcon, {
        id: id,
        width: "28",
        height: "28",
        "aria-label": id
      }), _el$3);
      _$insert(_el$3, id);
      return _el$2;
    })()));
    return _el$;
  })()
};