import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { Select as Kobalte } from "@kobalte/core/select";
import { createMemo, onCleanup, splitProps } from "solid-js";
import { pipe, groupBy, entries, map } from "remeda";
import { Button } from "./button.js";
import { Icon } from "./icon.js";
export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps"]);
  const state = {
    key: undefined,
    cleanup: undefined
  };
  const stop = () => {
    state.cleanup?.();
    state.cleanup = undefined;
    state.key = undefined;
  };
  const keyFor = item => local.value ? local.value(item) : item;
  const move = item => {
    if (!local.onHighlight) return;
    if (!item) {
      stop();
      return;
    }
    const key = keyFor(item);
    if (state.key === key) return;
    state.cleanup?.();
    state.cleanup = local.onHighlight(item);
    state.key = key;
  };
  onCleanup(stop);
  const grouped = createMemo(() => {
    const result = pipe(local.options, groupBy(x => local.groupBy ? local.groupBy(x) : ""),
    // mapValues((x) => x.sort((a, b) => a.title.localeCompare(b.title))),
    entries(), map(([k, v]) => ({
      category: k,
      options: v
    })));
    return result;
  });
  return (
    _$createComponent(Kobalte, _$mergeProps(others, {
      "data-component": "select",
      get ["data-trigger-style"]() {
        return local.triggerVariant;
      },
      get placement() {
        return local.triggerVariant === "settings" ? "bottom-end" : "bottom-start";
      },
      gutter: 4,
      get value() {
        return local.current;
      },
      get options() {
        return grouped();
      },
      optionValue: x => local.value ? local.value(x) : x,
      optionTextValue: x => local.label ? local.label(x) : x,
      optionGroupChildren: "options",
      get placeholder() {
        return local.placeholder;
      },
      sectionComponent: local => _$createComponent(Kobalte.Section, {
        "data-slot": "select-section",
        get children() {
          return local.section.rawValue.category;
        }
      }),
      itemComponent: itemProps => _$createComponent(Kobalte.Item, _$mergeProps(itemProps, {
        "data-slot": "select-select-item",
        get classList() {
          return {
            ...local.classList,
            [local.class ?? ""]: !!local.class
          };
        },
        onPointerEnter: () => move(itemProps.item.rawValue),
        onPointerMove: () => move(itemProps.item.rawValue),
        onFocus: () => move(itemProps.item.rawValue),
        get children() {
          return [_$createComponent(Kobalte.ItemLabel, {
            "data-slot": "select-select-item-label",
            get children() {
              return _$memo(() => !!local.children)() ? local.children(itemProps.item.rawValue) : _$memo(() => !!local.label)() ? local.label(itemProps.item.rawValue) : itemProps.item.rawValue;
            }
          }), _$createComponent(Kobalte.ItemIndicator, {
            "data-slot": "select-select-item-indicator",
            get children() {
              return _$createComponent(Icon, {
                name: "check-small",
                size: "small"
              });
            }
          })];
        }
      })),
      onChange: v => {
        local.onSelect?.(v ?? undefined);
        stop();
      },
      onOpenChange: open => {
        local.onOpenChange?.(open);
        if (!open) stop();
      },
      get children() {
        return [_$createComponent(Kobalte.Trigger, _$mergeProps(() => local.triggerProps, {
          get disabled() {
            return props.disabled;
          },
          "data-slot": "select-select-trigger",
          as: Button,
          get size() {
            return props.size;
          },
          get variant() {
            return props.variant;
          },
          get style() {
            return local.triggerStyle;
          },
          get classList() {
            return {
              ...local.classList,
              [local.class ?? ""]: !!local.class
            };
          },
          get children() {
            return [_$createComponent(Kobalte.Value, {
              "data-slot": "select-select-trigger-value",
              get ["class"]() {
                return local.valueClass;
              },
              children: state => {
                const selected = state.selectedOption() ?? local.current;
                if (!selected) return local.placeholder || "";
                if (local.label) return local.label(selected);
                return selected;
              }
            }), _$createComponent(Kobalte.Icon, {
              "data-slot": "select-select-trigger-icon",
              get children() {
                return _$createComponent(Icon, {
                  get name() {
                    return local.triggerVariant === "settings" ? "selector" : "chevron-down";
                  },
                  size: "small"
                });
              }
            })];
          }
        })), _$createComponent(Kobalte.Portal, {
          get children() {
            return _$createComponent(Kobalte.Content, {
              get classList() {
                return {
                  ...local.classList,
                  [local.class ?? ""]: !!local.class
                };
              },
              "data-component": "select-content",
              get ["data-trigger-style"]() {
                return local.triggerVariant;
              },
              get children() {
                return _$createComponent(Kobalte.Listbox, {
                  "data-slot": "select-select-content-list"
                });
              }
            });
          }
        })];
      }
    }))
  );
}
