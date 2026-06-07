import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:12px>`);
import * as mod from "./toast.js";
import { Button } from "./button.js";
const docs = `### Overview
Toast notifications with optional icons, actions, and progress.

Use brief titles/descriptions; limit actions to 1-2.

### API
- Use \`showToast\` or \`showPromiseToast\` to trigger toasts.
- Render \`Toast.Region\` once per page.
- \`Toast\` subcomponents compose the structure.

### Variants and states
- Variants: default, success, error, loading.
- Optional actions and persistent toasts.

### Behavior
- Toasts render in a portal and auto-dismiss unless persistent.

### Accessibility
- TODO: confirm aria-live behavior from Kobalte Toast.

### Theming/tokens
- Uses \`data-component="toast"\` and slot data attributes.

`;
export default {
  title: "UI/Toast",
  id: "components-toast",
  component: mod.Toast,
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
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(mod.Toast.Region, {}), null);
    _$insert(_el$, _$createComponent(Button, {
      variant: "primary",
      onClick: () => mod.showToast({
        title: "Saved",
        description: "Your changes are stored.",
        variant: "success",
        icon: "check"
      }),
      children: "Show success toast"
    }), null);
    _$insert(_el$, _$createComponent(Button, {
      variant: "secondary",
      onClick: () => mod.showToast({
        description: "This action needs attention.",
        variant: "error",
        icon: "warning"
      }),
      children: "Show error toast"
    }), null);
    return _el$;
  })()
};
export const Actions = {
  render: () => (() => {
    var _el$2 = _tmpl$();
    _$insert(_el$2, _$createComponent(mod.Toast.Region, {}), null);
    _$insert(_el$2, _$createComponent(Button, {
      variant: "secondary",
      onClick: () => mod.showToast({
        title: "Update available",
        description: "Restart to apply the update.",
        actions: [{
          label: "Restart",
          onClick: "dismiss"
        }, {
          label: "Later",
          onClick: "dismiss"
        }]
      }),
      children: "Show action toast"
    }), null);
    return _el$2;
  })()
};
export const Promise = {
  render: () => (() => {
    var _el$3 = _tmpl$();
    _$insert(_el$3, _$createComponent(mod.Toast.Region, {}), null);
    _$insert(_el$3, _$createComponent(Button, {
      variant: "secondary",
      onClick: () => mod.showPromiseToast(() => new Promise(resolve => setTimeout(() => resolve(true), 800)), {
        loading: "Saving...",
        success: () => "Saved",
        error: () => "Failed"
      }),
      children: "Show promise toast"
    }), null);
    return _el$3;
  })()
};
export const Loading = {
  render: () => (() => {
    var _el$4 = _tmpl$();
    _$insert(_el$4, _$createComponent(mod.Toast.Region, {}), null);
    _$insert(_el$4, _$createComponent(Button, {
      variant: "secondary",
      onClick: () => mod.showToast({
        description: "Syncing...",
        variant: "loading",
        persistent: true
      }),
      children: "Show loading toast"
    }), null);
    return _el$4;
  })()
};