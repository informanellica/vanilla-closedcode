import { createComponent as _$createComponent } from "solid-js/web";

import { Card, CardActions, CardDescription, CardTitle } from "./card.js";
import { Button } from "./button.js";
const docs = `### Overview
Surface container for grouping related content and actions.

Pair with \`Button\` or \`Tag\` for quick actions.

### API
- Optional: \`variant\` (normal, error, warning, success, info).
- Accepts standard div props.

### Variants and states
- Semantic variants for status-driven messaging.

### Behavior
- Pure presentational container.

### Accessibility
- Provide headings or aria labels when used in isolation.

### Theming/tokens
- Uses \`data-component="card"\` with variant data attributes.

`;
export default {
  title: "UI/Card",
  id: "components-card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  },
  args: {
    variant: "normal"
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["normal", "error", "warning", "success", "info"]
    }
  },
  render: props => {
    return _$createComponent(Card, {
      get variant() {
        return props.variant;
      },
      get children() {
        return [_$createComponent(CardTitle, {
          get variant() {
            return props.variant;
          },
          children: "Card title"
        }), _$createComponent(CardDescription, {
          children: "Small supporting text."
        }), _$createComponent(CardActions, {
          get children() {
            return _$createComponent(Button, {
              size: "small",
              variant: "secondary",
              children: "Action"
            });
          }
        })];
      }
    });
  }
};
export const Normal = {};
export const Error = {
  args: {
    variant: "error"
  }
};
export const Warning = {
  args: {
    variant: "warning"
  }
};
export const Success = {
  args: {
    variant: "success"
  }
};
export const Info = {
  args: {
    variant: "info"
  }
};