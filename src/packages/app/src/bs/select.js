import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<select data-component=select>`),
  _tmplGroup$ = /*#__PURE__*/_$template(`<optgroup>`),
  _tmplOption$ = /*#__PURE__*/_$template(`<option>`);
import { createMemo, For, onCleanup, Show, splitProps } from "solid-js";
import { pipe, groupBy, entries, map } from "remeda";

export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps", "size", "variant", "disabled"]);
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
  const labelFor = item => local.children ? local.children(item) : local.label ? local.label(item) : item;
  const move = item => {
    if (!local.onHighlight) return;
    if (item === undefined || item === null) {
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

  // Flat list of options (preserving group order) so the native select index
  // maps back to the original item passed by the consumer.
  const flat = createMemo(() => local.options ?? []);
  const grouped = createMemo(() => {
    return pipe(local.options ?? [], groupBy(x => local.groupBy ? local.groupBy(x) : ""), entries(), map(([category, options]) => ({
      category,
      options
    })));
  });
  const hasGroups = createMemo(() => local.groupBy && grouped().some(g => g.category !== ""));
  const currentKey = createMemo(() => local.current === undefined || local.current === null ? undefined : keyFor(local.current));
  const indexOfKey = key => flat().findIndex(item => keyFor(item) === key);

  const onChange = e => {
    const idx = e.currentTarget.selectedIndex;
    // Account for a leading placeholder option when no current value matches.
    const offset = hasPlaceholderOption() ? 1 : 0;
    const item = flat()[idx - offset];
    if (item === undefined) {
      local.onSelect?.(undefined);
    } else {
      local.onSelect?.(item);
    }
    stop();
  };

  const hasPlaceholderOption = () => currentKey() === undefined && !!local.placeholder;

  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(others, () => local.triggerProps, {
      get ["data-trigger-style"]() {
        return local.triggerVariant;
      },
      get ["data-size"]() {
        return local.size || "normal";
      },
      get ["data-variant"]() {
        return local.variant || "secondary";
      },
      get style() {
        return local.triggerStyle;
      },
      get classList() {
        return {
          ...local.classList,
          "form-select": true,
          "form-select-sm": local.size === "small",
          "form-select-lg": local.size === "large",
          [local.valueClass ?? ""]: !!local.valueClass,
          [local.class ?? ""]: !!local.class
        };
      }
    }), false, true);
    _el$.addEventListener("change", onChange);
    _el$.addEventListener("focus", () => local.onOpenChange?.(true));
    _el$.addEventListener("blur", () => {
      local.onOpenChange?.(false);
      stop();
    });
    _$effect(() => {
      _el$.disabled = !!local.disabled;
    });
    // Keep the native selected option in sync with the reactive `current` value.
    _$effect(() => {
      const offset = hasPlaceholderOption() ? 1 : 0;
      const idx = indexOfKey(currentKey());
      _el$.selectedIndex = idx < 0 ? 0 : idx + offset;
    });
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return hasPlaceholderOption();
      },
      get children() {
        var _opt = _tmplOption$();
        _opt.value = "";
        _opt.disabled = true;
        _$insert(_opt, () => local.placeholder);
        return _opt;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return hasGroups();
      },
      get fallback() {
        return _$createComponent(For, {
          get each() {
            return flat();
          },
          children: item => renderOption(item)
        });
      },
      get children() {
        return _$createComponent(For, {
          get each() {
            return grouped();
          },
          children: group => {
            var _g = _tmplGroup$();
            _$effect(() => _$setAttribute(_g, "label", group.category));
            _$insert(_g, _$createComponent(For, {
              get each() {
                return group.options;
              },
              children: item => renderOption(item)
            }));
            return _g;
          }
        });
      }
    }), null);
    return _el$;
  })();

  function renderOption(item) {
    var _opt = _tmplOption$();
    _opt.addEventListener("pointerenter", () => move(item));
    _$effect(() => {
      const key = keyFor(item);
      _opt.value = typeof key === "string" ? key : String(key ?? "");
    });
    _$effect(() => {
      _opt.selected = keyFor(item) === currentKey();
    });
    _$insert(_opt, () => labelFor(item));
    return _opt;
  }
}
