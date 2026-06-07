import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg data-component=logo-mark viewBox="0 0 16 20"fill=none xmlns=http://www.w3.org/2000/svg><path data-slot=logo-logo-mark-shadow d="M12 16H4V8H12V16Z"fill=var(--icon-weak-base)></path><path data-slot=logo-logo-mark-o d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z"fill=var(--icon-strong-base)>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<svg data-component=logo-splash viewBox="0 0 80 100"fill=none xmlns=http://www.w3.org/2000/svg><path d="M60 80H20V40H60V80Z"fill=var(--icon-base)></path><path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z"fill=var(--icon-strong-base)>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<svg xmlns=http://www.w3.org/2000/svg fill=none>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<svg><g></svg>`, false, true, false),
  _tmpl$5 = /*#__PURE__*/_$template(`<svg><path></svg>`, false, true, false);
import { For } from "solid-js";
export const Mark = props => {
  return (() => {
    var _el$ = _tmpl$();
    _$effect(_$p => _$classList(_el$, {
      [props.class ?? ""]: !!props.class
    }, _$p));
    return _el$;
  })();
};
export const Splash = props => {
  return (() => {
    var _el$2 = _tmpl$2();
    var _ref$ = props.ref;
    typeof _ref$ === "function" ? _$use(_ref$, _el$2) : props.ref = _el$2;
    _$effect(_$p => _$classList(_el$2, {
      [props.class ?? ""]: !!props.class
    }, _$p));
    return _el$2;
  })();
};
const BASE = "var(--icon-base)";
const WEAK = "var(--icon-weak-base)";
const C = {
  width: 24,
  paths: [{
    d: "M24 24V30H6V24H24Z",
    fill: WEAK
  }, {
    d: "M24 24H6V30H24V36H0V6H24V12H6V18H24V24Z",
    fill: BASE
  }]
};
const L = {
  width: 12,
  paths: [{
    d: "M12 30H6V36H0V6H6V30H12V36Z",
    fill: WEAK
  }, {
    d: "M12 30H6V6H0V36H12V30Z",
    fill: BASE
  }]
};
const O = {
  width: 24,
  paths: [{
    d: "M18 30H6V18H18V30Z",
    fill: WEAK
  }, {
    d: "M18 12H6V30H18V12ZM24 36H0V6H24V36Z",
    fill: BASE
  }]
};
const S = {
  width: 24,
  paths: [{
    d: "M24 24V30H6V24H24Z",
    fill: WEAK
  }, {
    d: "M0 18V6H24V12H6V18H24V36H0V30H18V24H0V18Z",
    fill: BASE
  }]
};
const E = {
  width: 24,
  paths: [{
    d: "M24 18V24H6V18H24Z",
    fill: WEAK
  }, {
    d: "M24 18H6V24H24V36H0V6H24V12H6V18H24Z",
    fill: BASE
  }]
};
const D = {
  width: 24,
  paths: [{
    d: "M18 30H6V18H18V30Z",
    fill: WEAK
  }, {
    d: "M18 12H6V30H18V12ZM24 36H0V6H18V0H24V36Z",
    fill: BASE
  }]
};
const WORD = [C, L, O, S, E, D, C, O, D, E];
const SPACING = 6;
const positioned = (() => {
  let x = 0;
  const out = [];
  for (const g of WORD) {
    out.push({
      x,
      glyph: g
    });
    x += g.width + SPACING;
  }
  return {
    width: x - SPACING,
    items: out
  };
})();
export const Logo = props => {
  return (() => {
    var _el$3 = _tmpl$3();
    _$insert(_el$3, _$createComponent(For, {
      get each() {
        return positioned.items;
      },
      children: item => (() => {
        var _el$4 = _tmpl$4();
        _$insert(_el$4, _$createComponent(For, {
          get each() {
            return item.glyph.paths;
          },
          children: p => (() => {
            var _el$5 = _tmpl$5();
            _$effect(_p$ => {
              var _v$3 = p.d,
                _v$4 = p.fill;
              _v$3 !== _p$.e && _$setAttribute(_el$5, "d", _p$.e = _v$3);
              _v$4 !== _p$.t && _$setAttribute(_el$5, "fill", _p$.t = _v$4);
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$5;
          })()
        }));
        _$effect(() => _$setAttribute(_el$4, "transform", `translate(${item.x}, 0)`));
        return _el$4;
      })()
    }));
    _$effect(_p$ => {
      var _v$ = `0 0 ${positioned.width} 42`,
        _v$2 = {
          [props.class ?? ""]: !!props.class
        };
      _v$ !== _p$.e && _$setAttribute(_el$3, "viewBox", _p$.e = _v$);
      _p$.t = _$classList(_el$3, _v$2, _p$.t);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$3;
  })();
};