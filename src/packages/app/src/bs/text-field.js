import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { Show, splitProps } from "solid-js";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=input><input>`),
  _tmplLabel$ = /*#__PURE__*/_$template(`<label class="form-label">`),
  _tmplError$ = /*#__PURE__*/_$template(`<div class="text-danger small mt-1">`);
export function TextField(props) {
  const [local, others] = splitProps(props, ["type", "value", "onChange", "placeholder", "variant", "class", "spellcheck", "autocomplete", "autocorrect", "autocapitalize", "label", "hideLabel", "name", "disabled", "readOnly", "required", "error", "validationState"]);
  const handleInput = e => {
    local.onChange?.(e.currentTarget.value);
  };
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !local.hideLabel && local.label;
      },
      get children() {
        var _label = _tmplLabel$();
        _$insert(_label, () => local.label);
        return _label;
      }
    }), _el$2);
    _$addEventListener(_el$2, "input", handleInput);
    // Validation error (red), shown below the input when an error is supplied.
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return local.error;
      },
      get children() {
        var _err = _tmplError$();
        _$insert(_err, () => local.error);
        return _err;
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = local.variant || "normal",
        _v$2 = "form-control" + (local.validationState === "invalid" ? " is-invalid" : "") + (local.class ? " " + local.class : ""),
        _v$3 = local.type || "text",
        _v$4 = local.placeholder,
        _v$5 = local.value ?? "",
        _v$6 = local.name,
        _v$7 = local.disabled,
        _v$8 = local.readOnly,
        _v$9 = local.required,
        _v$10 = local.spellcheck,
        _v$11 = local.autocomplete,
        _v$12 = local.autocorrect,
        _v$13 = local.autocapitalize;
      _v$ !== _p$.e && _$setAttribute(_el$, "data-variant", _p$.e = _v$);
      _v$2 !== _p$.t && _$className(_el$2, _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$2, "type", _p$.a = _v$3);
      _v$4 !== _p$.o && _$setAttribute(_el$2, "placeholder", _p$.o = _v$4);
      _v$5 !== _p$.i && (_el$2.value = _p$.i = _v$5);
      _v$6 !== _p$.n && _$setAttribute(_el$2, "name", _p$.n = _v$6);
      _v$7 !== _p$.s && (_el$2.disabled = _p$.s = _v$7);
      _v$8 !== _p$.h && (_el$2.readOnly = _p$.h = _v$8);
      _v$9 !== _p$.r && (_el$2.required = _p$.r = _v$9);
      _v$10 !== _p$.d && _$setAttribute(_el$2, "spellcheck", _p$.d = _v$10);
      _v$11 !== _p$.l && _$setAttribute(_el$2, "autocomplete", _p$.l = _v$11);
      _v$12 !== _p$.u && _$setAttribute(_el$2, "autocorrect", _p$.u = _v$12);
      _v$13 !== _p$.c && _$setAttribute(_el$2, "autocapitalize", _p$.c = _v$13);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined,
      r: undefined,
      d: undefined,
      l: undefined,
      u: undefined,
      c: undefined
    });
    return _el$;
  })();
}
