import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="absolute inset-0 z-10 d-flex align-items-center justify-content-center bg-body-tertiary pointer-events-none"><div class="d-flex flex-column align-items-center gap-2 text-secondary"><span class=fw-normal>`);
import { Show } from "solid-js";
import { Icon } from "@/bs/icon.js";
const kindToIcon = {
  image: "photo",
  "@mention": "link"
};
export const PromptDragOverlay = props => {
  return _$createComponent(Show, {
    get when() {
      return props.type !== null;
    },
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild;
      _$insert(_el$2, _$createComponent(Icon, {
        get name() {
          return _$memo(() => !!props.type)() ? kindToIcon[props.type] : kindToIcon.image;
        },
        "class": "size-8"
      }), _el$3);
      _$insert(_el$3, () => props.label);
      return _el$;
    }
  });
};