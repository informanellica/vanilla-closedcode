import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
import * as mod from "./dropdown-menu.js";
import { Button } from "./button.js";
const docs = `### Overview
Dropdown menu built on Kobalte with composable items, groups, and submenus.

Use \`DropdownMenu.ItemLabel\`/\`ItemDescription\` for richer rows.

### API
- Root accepts Kobalte DropdownMenu props (\`open\`, \`defaultOpen\`, \`onOpenChange\`).
- Compose with \`Trigger\`, \`Content\`, \`Item\`, \`Separator\`, and optional \`Sub\` sections.

### Variants and states
- Supports item groups, separators, and nested submenus.

### Behavior
- Menu opens from trigger and renders in a portal by default.

### Accessibility
- TODO: confirm keyboard navigation from Kobalte.

### Theming/tokens
- Uses \`data-component="dropdown-menu"\` and slot attributes for styling.

`;
export default {
  title: "UI/DropdownMenu",
  id: "components-dropdown-menu",
  component: mod.DropdownMenu,
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
  render: () => _$createComponent(mod.DropdownMenu, {
    defaultOpen: true,
    get children() {
      return [_$createComponent(mod.DropdownMenu.Trigger, {
        as: Button,
        variant: "secondary",
        size: "small",
        children: "Open menu"
      }), _$createComponent(mod.DropdownMenu.Portal, {
        get children() {
          return _$createComponent(mod.DropdownMenu.Content, {
            get children() {
              return [_$createComponent(mod.DropdownMenu.Group, {
                get children() {
                  return [_$createComponent(mod.DropdownMenu.GroupLabel, {
                    children: "Actions"
                  }), _$createComponent(mod.DropdownMenu.Item, {
                    get children() {
                      return _$createComponent(mod.DropdownMenu.ItemLabel, {
                        children: "New file"
                      });
                    }
                  }), _$createComponent(mod.DropdownMenu.Item, {
                    get children() {
                      return [_$createComponent(mod.DropdownMenu.ItemLabel, {
                        children: "Rename"
                      }), _$createComponent(mod.DropdownMenu.ItemDescription, {
                        children: "Shift+R"
                      })];
                    }
                  })];
                }
              }), _$createComponent(mod.DropdownMenu.Separator, {}), _$createComponent(mod.DropdownMenu.Sub, {
                get children() {
                  return [_$createComponent(mod.DropdownMenu.SubTrigger, {
                    children: "More options"
                  }), _$createComponent(mod.DropdownMenu.SubContent, {
                    get children() {
                      return [_$createComponent(mod.DropdownMenu.Item, {
                        get children() {
                          return _$createComponent(mod.DropdownMenu.ItemLabel, {
                            children: "Duplicate"
                          });
                        }
                      }), _$createComponent(mod.DropdownMenu.Item, {
                        get children() {
                          return _$createComponent(mod.DropdownMenu.ItemLabel, {
                            children: "Move"
                          });
                        }
                      })];
                    }
                  })];
                }
              })];
            }
          });
        }
      })];
    }
  })
};
export const CheckboxRadio = {
  render: () => _$createComponent(mod.DropdownMenu, {
    defaultOpen: true,
    get children() {
      return [_$createComponent(mod.DropdownMenu.Trigger, {
        as: Button,
        variant: "secondary",
        size: "small",
        children: "Open menu"
      }), _$createComponent(mod.DropdownMenu.Portal, {
        get children() {
          return _$createComponent(mod.DropdownMenu.Content, {
            get children() {
              return [_$createComponent(mod.DropdownMenu.CheckboxItem, {
                checked: true,
                children: "Show line numbers"
              }), _$createComponent(mod.DropdownMenu.CheckboxItem, {
                children: "Wrap lines"
              }), _$createComponent(mod.DropdownMenu.Separator, {}), _$createComponent(mod.DropdownMenu.RadioGroup, {
                value: "compact",
                get children() {
                  return [_$createComponent(mod.DropdownMenu.RadioItem, {
                    value: "compact",
                    children: "Compact"
                  }), _$createComponent(mod.DropdownMenu.RadioItem, {
                    value: "comfortable",
                    children: "Comfortable"
                  })];
                }
              })];
            }
          });
        }
      })];
    }
  })
};