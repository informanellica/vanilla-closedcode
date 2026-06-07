import { template as _$template } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<img data-slot=avatar-image>`);
import { splitProps, Show } from "solid-js";
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, {
  granularity: "grapheme"
}) : undefined;
function first(value) {
  if (!value) return "";
  if (!segmenter) return Array.from(value)[0] ?? "";
  return segmenter.segment(value)[Symbol.iterator]().next().value?.segment ?? Array.from(value)[0] ?? "";
}
export function Avatar(props) {
  const [split, rest] = splitProps(props, ["fallback", "src", "background", "foreground", "size", "class", "classList", "style"]);
  const src = split.src; // did this so i can zero it out to test fallback
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(rest, {
      "data-component": "avatar",
      get ["data-size"]() {
        return split.size || "normal";
      },
      "data-has-image": src ? "" : undefined,
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      },
      get style() {
        return {
          ...(typeof split.style === "object" ? split.style : {}),
          ...(!src && split.background ? {
            "--avatar-bg": split.background
          } : {}),
          ...(!src && split.foreground ? {
            "--avatar-fg": split.foreground
          } : {})
        };
      }
    }), false, true);
    _$insert(_el$, _$createComponent(Show, {
      when: src,
      get fallback() {
        return first(split.fallback);
      },
      children: src => (() => {
        var _el$2 = _tmpl$2();
        _$setAttribute(_el$2, "draggable", false);
        _$effect(() => _$setAttribute(_el$2, "src", src()));
        return _el$2;
      })()
    }));
    return _el$;
  })();
}