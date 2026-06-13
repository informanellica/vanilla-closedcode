import { template as _$template } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:flex;gap:12px>`);
import { onMount } from "../../../lib/reactivity.js";
import * as mod from "./dialog.js";
import { Button } from "./button.js";
import { useDialog } from "../context/dialog.js";
const docs = `### Overview
Dialog content wrapper used with the DialogProvider for modal flows.

Provide concise title/description and keep body focused.

### API
- Optional: \`title\`, \`description\`, \`action\`.
- \`size\`: normal | large | x-large.
- \`fit\` and \`transition\` control layout and animation.

### Variants and states
- Sizes and optional header/action controls.

### Behavior
- Intended to be rendered via \`useDialog().show\`.

### Accessibility
- TODO: confirm focus trapping and aria attributes from Kobalte Dialog.

### Theming/tokens
- Uses \`data-component="dialog"\` and slot attributes.

`;
export default {
  title: "UI/Dialog",
  id: "components-dialog",
  component: mod.Dialog,
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
  render: () => {
    const dialog = useDialog();
    const open = () => dialog.show(() => _$createComponent(mod.Dialog, {
      title: "Dialog",
      description: "Description",
      children: "Dialog body content."
    }));
    onMount(open);
    return _$createComponent(Button, {
      variant: "secondary",
      onClick: open,
      children: "Open dialog"
    });
  }
};
export const Sizes = {
  render: () => {
    const dialog = useDialog();
    return (() => {
      var _el$ = _tmpl$();
      _$insert(_el$, _$createComponent(Button, {
        variant: "secondary",
        onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
          title: "Normal",
          description: "Normal size",
          children: "Normal dialog content."
        })),
        children: "Normal"
      }), null);
      _$insert(_el$, _$createComponent(Button, {
        variant: "secondary",
        onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
          size: "large",
          title: "Large",
          description: "Large size",
          children: "Large dialog content."
        })),
        children: "Large"
      }), null);
      _$insert(_el$, _$createComponent(Button, {
        variant: "secondary",
        onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
          size: "x-large",
          title: "Extra large",
          description: "X-large size",
          children: "X-large dialog content."
        })),
        children: "X-Large"
      }), null);
      return _el$;
    })();
  }
};
export const Transition = {
  render: () => {
    const dialog = useDialog();
    return _$createComponent(Button, {
      variant: "secondary",
      onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
        title: "Transition",
        description: "Animated",
        transition: true,
        children: "Transition enabled."
      })),
      children: "Open transition dialog"
    });
  }
};
export const CustomAction = {
  render: () => {
    const dialog = useDialog();
    return _$createComponent(Button, {
      variant: "secondary",
      onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
        title: "Custom action",
        description: "Dialog with a custom header action",
        get action() {
          return _$createComponent(Button, {
            variant: "ghost",
            children: "Help"
          });
        },
        children: "Dialog body content."
      })),
      children: "Open action dialog"
    });
  }
};
export const Fit = {
  render: () => {
    const dialog = useDialog();
    return _$createComponent(Button, {
      variant: "secondary",
      onClick: () => dialog.show(() => _$createComponent(mod.Dialog, {
        title: "Fit content",
        fit: true,
        children: "Dialog fits its content."
      })),
      children: "Open fit dialog"
    });
  }
};