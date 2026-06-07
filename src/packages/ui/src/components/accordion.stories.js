import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style="color:var(--text-weak);padding:8px 0">Accordion content.`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style="color:var(--text-weak);padding:8px 0">More content.`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div style=display:grid;gap:8px;width:420px>`);
import { createEffect, createSignal } from "solid-js";
import * as mod from "./accordion.js";
import { create } from "../storybook/scaffold.js";
const docs = `### Overview
Accordion for collapsible content sections with optional multi-open behavior.

Use one trigger per item; keep content concise.

### API
- Root supports Kobalte Accordion props: \`value\`, \`multiple\`, \`collapsible\`, \`onChange\`.
- Compose with \`Accordion.Item\`, \`Header\`, \`Trigger\`, \`Content\`.

### Variants and states
- Single or multiple open items.
- Collapsible or fixed-open behavior.

### Behavior
- Controlled via \`value\`/\`onChange\` when provided.

### Accessibility
- TODO: confirm keyboard navigation from Kobalte Accordion.

### Theming/tokens
- Uses \`data-component="accordion"\` and slot data attributes.

`;
const story = create({
  title: "UI/Accordion",
  mod
});
export default {
  title: "UI/Accordion",
  id: "components-accordion",
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
export const Basic = {
  args: {
    collapsible: true,
    multiple: false,
    value: "first"
  },
  argTypes: {
    collapsible: {
      control: "boolean"
    },
    multiple: {
      control: "boolean"
    },
    value: {
      control: "select",
      options: ["first", "second", "none"],
      mapping: {
        none: undefined
      }
    }
  },
  render: props => {
    const [value, setValue] = createSignal(props.value);
    createEffect(() => {
      setValue(props.value);
    });
    const current = () => {
      if (props.multiple) {
        if (Array.isArray(value())) return value();
        if (value()) return [value()];
        return [];
      }
      if (Array.isArray(value())) return value()[0];
      return value();
    };
    return (() => {
      var _el$ = _tmpl$3();
      _$insert(_el$, _$createComponent(mod.Accordion, {
        get collapsible() {
          return props.collapsible;
        },
        get multiple() {
          return props.multiple;
        },
        get value() {
          return current();
        },
        onChange: setValue,
        get children() {
          return [_$createComponent(mod.Accordion.Item, {
            value: "first",
            get children() {
              return [_$createComponent(mod.Accordion.Header, {
                get children() {
                  return _$createComponent(mod.Accordion.Trigger, {
                    children: "First"
                  });
                }
              }), _$createComponent(mod.Accordion.Content, {
                get children() {
                  return _tmpl$();
                }
              })];
            }
          }), _$createComponent(mod.Accordion.Item, {
            value: "second",
            get children() {
              return [_$createComponent(mod.Accordion.Header, {
                get children() {
                  return _$createComponent(mod.Accordion.Trigger, {
                    children: "Second"
                  });
                }
              }), _$createComponent(mod.Accordion.Content, {
                get children() {
                  return _tmpl$2();
                }
              })];
            }
          })];
        }
      }));
      return _el$;
    })();
  }
};
export const Multiple = {
  args: {
    collapsible: true,
    multiple: true,
    value: ["first", "second"]
  },
  render: props => _$createComponent(mod.Accordion, {
    get collapsible() {
      return props.collapsible;
    },
    get multiple() {
      return props.multiple;
    },
    get value() {
      return props.value;
    },
    get children() {
      return [_$createComponent(mod.Accordion.Item, {
        value: "first",
        get children() {
          return [_$createComponent(mod.Accordion.Header, {
            get children() {
              return _$createComponent(mod.Accordion.Trigger, {
                children: "First"
              });
            }
          }), _$createComponent(mod.Accordion.Content, {
            get children() {
              return _tmpl$();
            }
          })];
        }
      }), _$createComponent(mod.Accordion.Item, {
        value: "second",
        get children() {
          return [_$createComponent(mod.Accordion.Header, {
            get children() {
              return _$createComponent(mod.Accordion.Trigger, {
                children: "Second"
              });
            }
          }), _$createComponent(mod.Accordion.Content, {
            get children() {
              return _tmpl$2();
            }
          })];
        }
      })];
    }
  })
};
export const NonCollapsible = {
  args: {
    collapsible: false,
    multiple: false,
    value: "first"
  },
  render: props => _$createComponent(mod.Accordion, {
    get collapsible() {
      return props.collapsible;
    },
    get multiple() {
      return props.multiple;
    },
    get value() {
      return props.value;
    },
    get children() {
      return _$createComponent(mod.Accordion.Item, {
        value: "first",
        get children() {
          return [_$createComponent(mod.Accordion.Header, {
            get children() {
              return _$createComponent(mod.Accordion.Trigger, {
                children: "First"
              });
            }
          }), _$createComponent(mod.Accordion.Content, {
            get children() {
              return _tmpl$();
            }
          })];
        }
      });
    }
  })
};