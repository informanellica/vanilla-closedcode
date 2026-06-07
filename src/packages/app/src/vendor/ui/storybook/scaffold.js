import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=storybook-missing><div>Missing component export.</div><div style=opacity:0.7;font-size:12px>Exports: `),
  _tmpl$2 = /*#__PURE__*/_$template(`<pre data-component=storybook-error style=white-space:pre-wrap>`);
import { ErrorBoundary } from "solid-js";
import { Dynamic } from "solid-js/web";
function fn(value) {
  return typeof value === "function";
}
function pick(mod, name) {
  if (name && fn(mod[name])) return mod[name];
  if (fn(mod.default)) return mod.default;
  const preferred = Object.keys(mod).filter(k => k[0] && k[0] === k[0].toUpperCase()).find(k => fn(mod[k]));
  if (preferred) return mod[preferred];
  const first = Object.keys(mod).find(k => fn(mod[k]));
  if (first) return mod[first];
  return () => {
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling,
        _el$4 = _el$3.firstChild;
      _$insert(_el$3, () => Object.keys(mod).join(", ") || "(none)", null);
      return _el$;
    })();
  };
}
export function create(input) {
  const component = pick(input.mod, input.name);
  return {
    meta: {
      title: input.title,
      component
    },
    Basic: {
      args: input.args ?? {},
      render: args => {
        return _$createComponent(ErrorBoundary, {
          fallback: err => {
            return (() => {
              var _el$5 = _tmpl$2();
              _$insert(_el$5, () => String(err));
              return _el$5;
            })();
          },
          get children() {
            return _$createComponent(Dynamic, _$mergeProps({
              component: component
            }, args));
          }
        });
      }
    }
  };
}