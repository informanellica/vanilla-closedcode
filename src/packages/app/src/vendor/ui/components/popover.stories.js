import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
import { createSignal } from "../../../lib/reactivity.js";
import * as mod from "./popover.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Composable popover with optional title, description, and close button.

Use for small contextual details; avoid long forms.

### API
- \`trigger\` and \`children\` define the anchor and content.
- Optional: \`title\`, \`description\`, \`portal\`, \`open\`, \`defaultOpen\`.

### Variants and states
- Supports controlled and uncontrolled open state.

### Behavior
- Closes on outside click or Escape by default.

### Accessibility
- TODO: confirm focus management from Kobalte.

### Theming/tokens
- Uses \`data-component="popover-content"\` and related slots.

`;
const story = create({
  title: "UI/Popover",
  mod,
  args: {
    trigger: "Open popover",
    title: "Popover",
    description: "Optional description",
    defaultOpen: true,
    children: "Popover content"
  }
});
export default {
  title: "UI/Popover",
  id: "components-popover",
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
export const NoHeader = {
  args: {
    title: undefined,
    description: undefined,
    children: "Popover body only"
  }
};
export const Inline = {
  args: {
    portal: false,
    defaultOpen: true
  }
};
export const Controlled = {
  render: () => {
    const [open, setOpen] = createSignal(true);
    return _$createComponent(mod.Popover, {
      get open() {
        return open();
      },
      onOpenChange: setOpen,
      trigger: "Toggle popover",
      title: "Controlled",
      description: "Open state is controlled",
      children: "Controlled content"
    });
  }
};