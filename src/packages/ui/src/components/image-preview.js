import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=image-preview-header>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=image-preview-body><img data-slot=image-preview-image>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-component=image-preview><div data-slot=image-preview-container>`);
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
export function ImagePreview(props) {
  const i18n = useI18n();
  return (() => {
    var _el$ = _tmpl$3(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, _$createComponent(Kobalte.Content, {
      "data-slot": "image-preview-content",
      get children() {
        return [(() => {
          var _el$3 = _tmpl$();
          _$insert(_el$3, _$createComponent(Kobalte.CloseButton, {
            "data-slot": "image-preview-close",
            as: IconButton,
            icon: "close",
            variant: "ghost",
            get ["aria-label"]() {
              return i18n.t("ui.common.close");
            }
          }));
          return _el$3;
        })(), (() => {
          var _el$4 = _tmpl$2(),
            _el$5 = _el$4.firstChild;
          _$effect(_p$ => {
            var _v$ = props.src,
              _v$2 = props.alt ?? i18n.t("ui.imagePreview.alt");
            _v$ !== _p$.e && _$setAttribute(_el$5, "src", _p$.e = _v$);
            _v$2 !== _p$.t && _$setAttribute(_el$5, "alt", _p$.t = _v$2);
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$4;
        })()];
      }
    }));
    return _el$;
  })();
}