import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div role=presentation data-slot=radio-group-wrapper><div role=presentation data-slot=radio-group-items>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=radio-group-item-control>`);
import { SegmentedControl as Kobalte } from "@kobalte/core/segmented-control";
import { For, splitProps } from "solid-js";
export function RadioGroup(props) {
  const [local, others] = splitProps(props, ["class", "classList", "options", "current", "defaultValue", "value", "label", "onSelect", "size", "fill", "pad"]);
  const getValue = item => {
    if (local.value) return local.value(item);
    return String(item);
  };
  const getLabel = item => {
    if (local.label) return local.label(item);
    return String(item);
  };
  const findOption = v => {
    return local.options.find(opt => getValue(opt) === v);
  };
  return _$createComponent(Kobalte, _$mergeProps(others, {
    "data-component": "radio-group",
    get ["data-size"]() {
      return local.size ?? "medium";
    },
    get ["data-fill"]() {
      return local.fill ? "" : undefined;
    },
    get ["data-pad"]() {
      return local.pad ?? "normal";
    },
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get value() {
      return _$memo(() => !!local.current)() ? getValue(local.current) : undefined;
    },
    get defaultValue() {
      return _$memo(() => !!local.defaultValue)() ? getValue(local.defaultValue) : undefined;
    },
    onChange: v => local.onSelect?.(findOption(v)),
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild;
      _$insert(_el$, _$createComponent(Kobalte.Indicator, {
        "data-slot": "radio-group-indicator"
      }), _el$2);
      _$insert(_el$2, _$createComponent(For, {
        get each() {
          return local.options;
        },
        children: option => _$createComponent(Kobalte.Item, {
          get value() {
            return getValue(option);
          },
          "data-slot": "radio-group-item",
          get ["data-value"]() {
            return getValue(option);
          },
          get children() {
            return [_$createComponent(Kobalte.ItemInput, {
              "data-slot": "radio-group-item-input"
            }), _$createComponent(Kobalte.ItemLabel, {
              "data-slot": "radio-group-item-label",
              get children() {
                var _el$3 = _tmpl$2();
                _$insert(_el$3, () => getLabel(option));
                return _el$3;
              }
            })];
          }
        })
      }));
      return _el$;
    }
  }));
}