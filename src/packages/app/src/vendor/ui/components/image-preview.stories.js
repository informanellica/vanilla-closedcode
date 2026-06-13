import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
import { onMount } from "../../../lib/reactivity.js";
import * as mod from "./image-preview.js";
import { Button } from "./button.js";
import { useDialog } from "../context/dialog.js";
const docs = `### Overview
Image preview content intended to render inside the dialog stack.

Use for full-size image inspection; keep images optimized.

### API
- Required: \`src\`.
- Optional: \`alt\` text.

### Variants and states
- Single layout with close action.

### Behavior
- Intended to be used via \`useDialog().show\`.

### Accessibility
- Uses localized aria-label for close button.

### Theming/tokens
- Uses \`data-component="image-preview"\` and slot attributes.

`;
export default {
  title: "UI/ImagePreview",
  id: "components-image-preview",
  component: mod.ImagePreview,
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
    const src = "https://placehold.co/640x360/png";
    const open = () => dialog.show(() => _$createComponent(mod.ImagePreview, {
      src: src,
      alt: "Preview"
    }));
    onMount(open);
    return _$createComponent(Button, {
      variant: "secondary",
      onClick: open,
      children: "Open image preview"
    });
  }
};