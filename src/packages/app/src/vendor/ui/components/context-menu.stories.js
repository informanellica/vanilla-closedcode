import { template as _$template } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="padding:20px;border:1px dashed var(--border-weak);border-radius:8px;color:var(--text-weak)">Right click (or open) here`);
import * as mod from "./context-menu.js";
const docs = `### Overview
Context menu for right-click interactions with composable items and submenus.

Use \`ItemLabel\` and \`ItemDescription\` for rich items.

### API
- Root accepts Kobalte ContextMenu props (\`open\`, \`defaultOpen\`, \`onOpenChange\`).
- Compose \`Trigger\`, \`Content\`, \`Item\`, \`Separator\`, and optional \`Sub\` sections.

### Variants and states
- Supports grouped sections and nested submenus.

### Behavior
- Opens on context menu gesture over the trigger element.

### Accessibility
- TODO: confirm keyboard and focus behavior from Kobalte.

### Theming/tokens
- Uses \`data-component="context-menu"\` and slot attributes for styling.

`;
export default {
  title: "UI/ContextMenu",
  id: "components-context-menu",
  component: mod.ContextMenu,
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
  render: () => _$createComponent(mod.ContextMenu, {
    defaultOpen: true,
    get children() {
      return [_$createComponent(mod.ContextMenu.Trigger, {
        get children() {
          return _tmpl$();
        }
      }), _$createComponent(mod.ContextMenu.Portal, {
        get children() {
          return _$createComponent(mod.ContextMenu.Content, {
            get children() {
              return [_$createComponent(mod.ContextMenu.Group, {
                get children() {
                  return [_$createComponent(mod.ContextMenu.GroupLabel, {
                    children: "Actions"
                  }), _$createComponent(mod.ContextMenu.Item, {
                    get children() {
                      return _$createComponent(mod.ContextMenu.ItemLabel, {
                        children: "Copy"
                      });
                    }
                  }), _$createComponent(mod.ContextMenu.Item, {
                    get children() {
                      return _$createComponent(mod.ContextMenu.ItemLabel, {
                        children: "Paste"
                      });
                    }
                  })];
                }
              }), _$createComponent(mod.ContextMenu.Separator, {}), _$createComponent(mod.ContextMenu.Sub, {
                get children() {
                  return [_$createComponent(mod.ContextMenu.SubTrigger, {
                    children: "More"
                  }), _$createComponent(mod.ContextMenu.SubContent, {
                    get children() {
                      return [_$createComponent(mod.ContextMenu.Item, {
                        get children() {
                          return _$createComponent(mod.ContextMenu.ItemLabel, {
                            children: "Duplicate"
                          });
                        }
                      }), _$createComponent(mod.ContextMenu.Item, {
                        get children() {
                          return _$createComponent(mod.ContextMenu.ItemLabel, {
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
  render: () => _$createComponent(mod.ContextMenu, {
    defaultOpen: true,
    get children() {
      return [_$createComponent(mod.ContextMenu.Trigger, {
        get children() {
          return _tmpl$();
        }
      }), _$createComponent(mod.ContextMenu.Portal, {
        get children() {
          return _$createComponent(mod.ContextMenu.Content, {
            get children() {
              return [_$createComponent(mod.ContextMenu.CheckboxItem, {
                checked: true,
                children: "Show line numbers"
              }), _$createComponent(mod.ContextMenu.CheckboxItem, {
                children: "Wrap lines"
              }), _$createComponent(mod.ContextMenu.Separator, {}), _$createComponent(mod.ContextMenu.RadioGroup, {
                value: "compact",
                get children() {
                  return [_$createComponent(mod.ContextMenu.RadioItem, {
                    value: "compact",
                    children: "Compact"
                  }), _$createComponent(mod.ContextMenu.RadioItem, {
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