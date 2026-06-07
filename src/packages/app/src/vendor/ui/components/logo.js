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
// Brand mark: Bootstrap `c-square` icon as an inline SVG. Rendered as SVG (not
// an <i> font glyph) so it scales with the width utility classes the callers
// pass (w-10, md:w-xl, …) and inherits color via currentColor — exactly like
// the closedcode logo SVG it replaces.
var _tmplCSquare = /*#__PURE__*/_$template(`<svg viewBox="0 0 16 16" fill=currentColor xmlns=http://www.w3.org/2000/svg><path d="M8.146 4.992c-1.212 0-1.927.92-1.927 2.502v1.06c0 1.571.703 2.462 1.927 2.462.979 0 1.641-.586 1.729-1.418h1.295v.093c-.1 1.448-1.354 2.467-3.03 2.467-2.091 0-3.269-1.336-3.269-3.603V7.482c0-2.261 1.201-3.638 3.27-3.638 1.681 0 2.935 1.054 3.029 2.572v.088H9.875c-.088-.879-.768-1.512-1.729-1.512"></path><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 0a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z"></path></svg>`);
export const Mark = props => {
  var _el$ = _tmplCSquare();
  _$effect(_$p => _$classList(_el$, {
    [props.class ?? ""]: !!props.class
  }, _$p));
  return _el$;
};
export const Splash = props => {
  var _el$2 = _tmplCSquare();
  var _ref$ = props.ref;
  typeof _ref$ === "function" ? _$use(_ref$, _el$2) : props.ref = _el$2;
  _$effect(_$p => _$classList(_el$2, {
    [props.class ?? ""]: !!props.class
  }, _$p));
  return _el$2;
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
// Logo (the large faint home watermark / error-page brand) now renders the
// same c-square mark, scaled by the caller's width class.
export const Logo = props => {
  var _el$3 = _tmplCSquare();
  _$effect(_$p => _$classList(_el$3, {
    [props.class ?? ""]: !!props.class
  }, _$p));
  return _el$3;
};