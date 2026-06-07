import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=card-title-icon>`);
import { splitProps } from "solid-js";
import { Icon } from "./icon.js";
function pick(variant) {
  if (variant === "error") return "circle-ban-sign";
  if (variant === "warning") return "warning";
  if (variant === "success") return "circle-check";
  if (variant === "info") return "help";
  return;
}
function mix(style, value) {
  if (!value) return style;
  if (!style) return {
    "--card-accent": value
  };
  if (typeof style === "string") return `${style};--card-accent:${value};`;
  return {
    ...style,
    "--card-accent": value
  };
}
export function Card(props) {
  const [split, rest] = splitProps(props, ["variant", "style", "class", "classList"]);
  const variant = () => split.variant ?? "normal";
  const accent = () => {
    const v = variant();
    if (v === "error") return "var(--icon-critical-base)";
    if (v === "warning") return "var(--icon-warning-active)";
    if (v === "success") return "var(--icon-success-active)";
    if (v === "info") return "var(--icon-info-active)";
    return;
  };
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(rest, {
      "data-component": "card",
      get ["data-variant"]() {
        return variant();
      },
      get style() {
        return mix(split.style, accent());
      },
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$, () => props.children);
    return _el$;
  })();
}
export function CardTitle(props) {
  const [split, rest] = splitProps(props, ["variant", "icon", "class", "classList", "children"]);
  const show = () => split.icon !== false && split.icon !== null;
  const name = () => {
    if (split.icon === false || split.icon === null) return;
    if (typeof split.icon === "string") return split.icon;
    return pick(split.variant ?? "normal");
  };
  const placeholder = () => !name();
  return (() => {
    var _el$2 = _tmpl$();
    _$spread(_el$2, _$mergeProps(rest, {
      "data-slot": "card-title",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$2, (() => {
      var _c$ = _$memo(() => !!show());
      return () => _c$() ? (() => {
        var _el$3 = _tmpl$2();
        _$insert(_el$3, _$createComponent(Icon, {
          get name() {
            return name() ?? "dash";
          },
          size: "small"
        }));
        _$effect(() => _$setAttribute(_el$3, "data-placeholder", placeholder() || undefined));
        return _el$3;
      })() : null;
    })(), null);
    _$insert(_el$2, () => split.children, null);
    return _el$2;
  })();
}
export function CardDescription(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$4 = _tmpl$();
    _$spread(_el$4, _$mergeProps(rest, {
      "data-slot": "card-description",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$4, () => split.children);
    return _el$4;
  })();
}
export function CardActions(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$5 = _tmpl$();
    _$spread(_el$5, _$mergeProps(rest, {
      "data-slot": "card-actions",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$5, () => split.children);
    return _el$5;
  })();
}