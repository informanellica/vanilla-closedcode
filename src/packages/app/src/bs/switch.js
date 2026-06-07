import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=switch><input type=checkbox role=switch class=form-check-input><label class=form-check-label>`);
import { createUniqueId, Show, splitProps } from "solid-js";
export function Switch(props) {
  const [local, others] = splitProps(props, ["checked", "onChange", "disabled", "hideLabel", "children", "class", "classList"]);
  const id = createUniqueId();
  return (() => {
    var _el$ = _tmpl$(),
      _input = _el$.firstChild,
      _label = _input.nextSibling;
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          "form-check": true,
          "form-switch": true,
          [local.class ?? ""]: !!local.class
        };
      }
    }, others), false, true);
    _input.addEventListener("change", e => {
      local.onChange?.(e.currentTarget.checked);
    });
    _$effect(() => _$setAttribute(_input, "id", id));
    _$effect(() => {
      _input.checked = !!local.checked;
    });
    _$effect(() => {
      _input.disabled = !!local.disabled;
    });
    _$effect(() => _$setAttribute(_label, "for", id));
    _$insert(_label, _$createComponent(Show, {
      get when() {
        return local.children;
      },
      get children() {
        return local.children;
      }
    }));
    _$effect(() => _label.classList.toggle("visually-hidden", !!local.hideLabel));
    return _el$;
  })();
}
