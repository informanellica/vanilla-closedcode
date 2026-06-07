import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill, minmax(72px, 1fr))">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style=display:grid;gap:6px;justify-items:center><div style=font-size:10px;color:var(--text-weak);text-align:center>`);
import { iconNames } from "./app-icons/types.js";
import * as mod from "./app-icon.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Application icon renderer for known editor/terminal apps.

Use in provider or app selection lists.

### API
- Required: \`id\` (app icon name).
- Accepts standard img props except \`src\`.

### Variants and states
- Auto-switches themed icons when available.

### Behavior
- Watches color scheme changes to swap themed assets.

### Accessibility
- Provide \`alt\` text when the icon conveys meaning.

### Theming/tokens
- Uses \`data-component="app-icon"\`.

`;
const story = create({
  title: "UI/AppIcon",
  mod,
  args: {
    id: "vscode"
  }
});
export default {
  title: "UI/AppIcon",
  id: "components-app-icon",
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
      _$insert(_el$2, _$createComponent(mod.AppIcon, {
        id: id,
        alt: id
      }), _el$3);
      _$insert(_el$3, id);
      return _el$2;
    })()));
    return _el$;
  })()
};