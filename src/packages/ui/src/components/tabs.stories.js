import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px><div style=font-size:12px;color:var(--text-weak)>`);
import { IconButton } from "./icon-button.js";
import { createSignal } from "solid-js";
import * as mod from "./tabs.js";
const docs = `### Overview
Tabbed navigation for switching between related panels.

Compose \`Tabs.List\` + \`Tabs.Trigger\` + \`Tabs.Content\`.

### API
- Root accepts Kobalte Tabs props (\`value\`, \`defaultValue\`, \`onChange\`).
- \`variant\` sets visual style: normal, alt, pill, settings.
- \`orientation\` supports horizontal or vertical layouts.
- Trigger supports \`closeButton\`, \`hideCloseButton\`, and \`onMiddleClick\`.

### Variants and states
- Normal, alt, pill, settings variants.
- Horizontal and vertical orientations.

### Behavior
- Uses Kobalte Tabs for roving focus and selection management.

### Accessibility
- TODO: confirm keyboard interactions from Kobalte Tabs.

### Theming/tokens
- Uses \`data-component="tabs"\` with variant/orientation data attributes.

`;
export default {
  title: "UI/Tabs",
  id: "components-tabs",
  component: mod.Tabs,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs
      }
    }
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["normal", "alt", "pill", "settings"]
    },
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"]
    }
  }
};
export const Basic = {
  args: {
    variant: "normal",
    orientation: "horizontal",
    defaultValue: "overview"
  },
  render: props => _$createComponent(mod.Tabs, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Tabs.List, {
        get children() {
          return [_$createComponent(mod.Tabs.Trigger, {
            value: "overview",
            children: "Overview"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "details",
            children: "Details"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "activity",
            children: "Activity"
          })];
        }
      }), _$createComponent(mod.Tabs.Content, {
        value: "overview",
        children: "Overview content"
      }), _$createComponent(mod.Tabs.Content, {
        value: "details",
        children: "Details content"
      }), _$createComponent(mod.Tabs.Content, {
        value: "activity",
        children: "Activity content"
      })];
    }
  }))
};
export const Settings = {
  args: {
    variant: "settings",
    orientation: "horizontal",
    defaultValue: "general"
  },
  render: props => _$createComponent(mod.Tabs, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Tabs.List, {
        get children() {
          return [_$createComponent(mod.Tabs.Trigger, {
            value: "general",
            children: "General"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "appearance",
            children: "Appearance"
          })];
        }
      }), _$createComponent(mod.Tabs.Content, {
        value: "general",
        children: "General settings"
      }), _$createComponent(mod.Tabs.Content, {
        value: "appearance",
        children: "Appearance settings"
      })];
    }
  }))
};
export const Alt = {
  args: {
    variant: "alt",
    orientation: "horizontal",
    defaultValue: "first"
  },
  render: props => _$createComponent(mod.Tabs, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Tabs.List, {
        get children() {
          return [_$createComponent(mod.Tabs.Trigger, {
            value: "first",
            children: "First"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "second",
            children: "Second"
          })];
        }
      }), _$createComponent(mod.Tabs.Content, {
        value: "first",
        children: "Alt content"
      }), _$createComponent(mod.Tabs.Content, {
        value: "second",
        children: "Alt content 2"
      })];
    }
  }))
};
export const Vertical = {
  args: {
    variant: "pill",
    orientation: "vertical",
    defaultValue: "alpha"
  },
  render: props => _$createComponent(mod.Tabs, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Tabs.List, {
        get children() {
          return [_$createComponent(mod.Tabs.Trigger, {
            value: "alpha",
            children: "Alpha"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "beta",
            children: "Beta"
          })];
        }
      }), _$createComponent(mod.Tabs.Content, {
        value: "alpha",
        children: "Alpha content"
      }), _$createComponent(mod.Tabs.Content, {
        value: "beta",
        children: "Beta content"
      })];
    }
  }))
};
export const Closable = {
  args: {
    variant: "normal",
    orientation: "horizontal",
    defaultValue: "tab-1"
  },
  render: props => _$createComponent(mod.Tabs, _$mergeProps(props, {
    get children() {
      return [_$createComponent(mod.Tabs.List, {
        get children() {
          return [_$createComponent(mod.Tabs.Trigger, {
            value: "tab-1",
            get closeButton() {
              return _$createComponent(IconButton, {
                icon: "close",
                size: "small",
                variant: "ghost",
                "aria-label": "Close tab"
              });
            },
            children: "Tab 1"
          }), _$createComponent(mod.Tabs.Trigger, {
            value: "tab-2",
            children: "Tab 2"
          })];
        }
      }), _$createComponent(mod.Tabs.Content, {
        value: "tab-1",
        children: "Closable content"
      }), _$createComponent(mod.Tabs.Content, {
        value: "tab-2",
        children: "Standard content"
      })];
    }
  }))
};
export const MiddleClick = {
  args: {
    variant: "normal",
    orientation: "horizontal",
    defaultValue: "tab-1"
  },
  render: props => {
    const [message, setMessage] = createSignal("Middle click a tab");
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild;
      _$insert(_el$2, message);
      _$insert(_el$, _$createComponent(mod.Tabs, _$mergeProps(props, {
        get children() {
          return [_$createComponent(mod.Tabs.List, {
            get children() {
              return [_$createComponent(mod.Tabs.Trigger, {
                value: "tab-1",
                onMiddleClick: () => setMessage("Middle clicked tab-1"),
                children: "Tab 1"
              }), _$createComponent(mod.Tabs.Trigger, {
                value: "tab-2",
                onMiddleClick: () => setMessage("Middle clicked tab-2"),
                children: "Tab 2"
              })];
            }
          }), _$createComponent(mod.Tabs.Content, {
            value: "tab-1",
            children: "Tab 1 content"
          }), _$createComponent(mod.Tabs.Content, {
            value: "tab-2",
            children: "Tab 2 content"
          })];
        }
      })), null);
      return _el$;
    })();
  }
};