import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-wrap gap-2 px-3 pt-3">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<img class="size-16 rounded-2 object-cover border transition-colors">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="relative group"><button type=button class="absolute -top-1.5 -right-1.5 size-5 rounded-circle bg-body-tertiary border d-flex align-items-center justify-content-center opacity-0 group-hover:opacity-100 transition-opacity"></button><div class="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md"><span class="small fw-normal text-white truncate block">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="size-16 rounded-2 bg-body-tertiary d-flex align-items-center justify-content-center border">`);
import { For, Show } from "solid-js";
import { Icon } from "@/bs/icon.js";
import { Tooltip } from "@/bs/tooltip.js";
const fallbackClass = "size-16 rounded-2 bg-body-tertiary d-flex align-items-center justify-content-center border";
const imageClass = "size-16 rounded-2 object-cover border transition-colors";
const removeClass = "absolute -top-1.5 -right-1.5 size-5 rounded-circle bg-body-tertiary border d-flex align-items-center justify-content-center opacity-0 group-hover:opacity-100 transition-opacity";
const nameClass = "absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md";
export const PromptImageAttachments = props => {
  return _$createComponent(Show, {
    get when() {
      return props.attachments.length > 0;
    },
    get children() {
      var _el$ = _tmpl$();
      _$insert(_el$, _$createComponent(For, {
        get each() {
          return props.attachments;
        },
        children: attachment => _$createComponent(Tooltip, {
          get value() {
            return attachment.filename;
          },
          placement: "top",
          contentClass: "break-all",
          get children() {
            var _el$2 = _tmpl$3(),
              _el$4 = _el$2.firstChild,
              _el$5 = _el$4.nextSibling,
              _el$6 = _el$5.firstChild;
            _$insert(_el$2, _$createComponent(Show, {
              get when() {
                return attachment.mime.startsWith("image/");
              },
              get fallback() {
                return (() => {
                  var _el$7 = _tmpl$4();
                  _$insert(_el$7, _$createComponent(Icon, {
                    name: "folder",
                    "class": "size-6 text-secondary"
                  }));
                  return _el$7;
                })();
              },
              get children() {
                var _el$3 = _tmpl$2();
                _el$3.$$click = () => props.onOpen(attachment);
                _$effect(_p$ => {
                  var _v$ = attachment.dataUrl,
                    _v$2 = attachment.filename;
                  _v$ !== _p$.e && _$setAttribute(_el$3, "src", _p$.e = _v$);
                  _v$2 !== _p$.t && _$setAttribute(_el$3, "alt", _p$.t = _v$2);
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$3;
              }
            }), _el$4);
            _el$4.$$click = () => props.onRemove(attachment.id);
            _$insert(_el$4, _$createComponent(Icon, {
              name: "close",
              "class": "size-3 text-secondary"
            }));
            _$insert(_el$6, () => attachment.filename);
            _$effect(() => _$setAttribute(_el$4, "aria-label", props.removeLabel));
            return _el$2;
          }
        })
      }));
      return _el$;
    }
  });
};
_$delegateEvents(["click"]);