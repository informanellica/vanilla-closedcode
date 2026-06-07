import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=tool-count-summary><span data-slot=tool-count-summary-empty><span data-slot=tool-count-summary-empty-inner>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=tool-count-summary-prefix>,`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-slot=tool-count-summary-item><span data-slot=tool-count-summary-item-inner>`);
import { Index, createMemo } from "solid-js";
import { AnimatedCountLabel } from "./tool-count-label.js";
export function AnimatedCountList(props) {
  const visible = createMemo(() => props.items.filter(item => item.count > 0));
  const fallback = createMemo(() => props.fallback ?? "");
  const showEmpty = createMemo(() => visible().length === 0 && fallback().length > 0);
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    _$insert(_el$3, fallback);
    _$insert(_el$, _$createComponent(Index, {
      get each() {
        return props.items;
      },
      children: (item, index) => {
        const active = createMemo(() => item().count > 0);
        const hasPrev = createMemo(() => {
          for (let i = index - 1; i >= 0; i--) {
            if (props.items[i].count > 0) return true;
          }
          return false;
        });
        return [(() => {
          var _el$4 = _tmpl$2();
          _$effect(() => _$setAttribute(_el$4, "data-active", active() && hasPrev() ? "true" : "false"));
          return _el$4;
        })(), (() => {
          var _el$5 = _tmpl$3(),
            _el$6 = _el$5.firstChild;
          _$insert(_el$6, _$createComponent(AnimatedCountLabel, {
            get one() {
              return item().one;
            },
            get other() {
              return item().other;
            },
            get count() {
              return Math.max(0, Math.round(item().count));
            }
          }));
          _$effect(() => _$setAttribute(_el$5, "data-active", active() ? "true" : "false"));
          return _el$5;
        })()];
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = props.class,
        _v$2 = showEmpty() ? "true" : "false";
      _v$ !== _p$.e && _$className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$2, "data-active", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}