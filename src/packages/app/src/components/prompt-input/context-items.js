import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-nowrap align-items-start gap-2 p-2 overflow-x-auto no-scrollbar">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div><div class="d-flex align-items-center gap-1.5"><div class="d-flex align-items-center small fw-normal min-w-0 font-medium"><span class="text-body-emphasis whitespace-nowrap">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span class="d-flex max-w-[300px]"><span class="text-white truncate-start [unicode-bidi:plaintext] min-w-0"></span><span class=shrink-0>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span class="text-secondary whitespace-nowrap shrink-0">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="small fw-normal text-body-emphasis ml-5 pr-1 truncate">`);
import { For, Show } from "solid-js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tooltip } from "@/bs/tooltip.js";
import { getDirectory, getFilename, getFilenameTruncated } from "core/util/path";
export const PromptContextItems = props => {
  return _$createComponent(Show, {
    get when() {
      return props.items.length > 0;
    },
    get children() {
      var _el$ = _tmpl$();
      _$insert(_el$, _$createComponent(For, {
        get each() {
          return props.items;
        },
        children: item => {
          const directory = getDirectory(item.path);
          const filename = getFilename(item.path);
          const label = getFilenameTruncated(item.path, 14);
          const selected = props.active(item);
          return _$createComponent(Tooltip, {
            get value() {
              return (() => {
                var _el$6 = _tmpl$3(),
                  _el$7 = _el$6.firstChild,
                  _el$8 = _el$7.nextSibling;
                _$insert(_el$7, directory);
                _$insert(_el$8, filename);
                return _el$6;
              })();
            },
            placement: "top",
            openDelay: 2000,
            get children() {
              var _el$2 = _tmpl$2(),
                _el$3 = _el$2.firstChild,
                _el$4 = _el$3.firstChild,
                _el$5 = _el$4.firstChild;
              _el$2.$$click = () => props.openComment(item);
              _$insert(_el$3, _$createComponent(FileIcon, {
                get node() {
                  return {
                    path: item.path,
                    type: "file"
                  };
                },
                "class": "shrink-0 size-3.5"
              }), _el$4);
              _$insert(_el$5, label);
              _$insert(_el$4, _$createComponent(Show, {
                get when() {
                  return item.selection;
                },
                children: sel => (() => {
                  var _el$9 = _tmpl$4();
                  _$insert(_el$9, (() => {
                    var _c$ = _$memo(() => sel().startLine === sel().endLine);
                    return () => _c$() ? `:${sel().startLine}` : `:${sel().startLine}-${sel().endLine}`;
                  })());
                  return _el$9;
                })()
              }), null);
              _$insert(_el$3, _$createComponent(IconButton, {
                type: "button",
                icon: "close-small",
                variant: "ghost",
                "class": "ml-auto size-3.5 text-secondary transition-all",
                onClick: e => {
                  e.stopPropagation();
                  props.remove(item);
                },
                get ["aria-label"]() {
                  return props.t("prompt.context.removeFile");
                }
              }), null);
              _$insert(_el$2, _$createComponent(Show, {
                get when() {
                  return item.comment;
                },
                children: comment => (() => {
                  var _el$0 = _tmpl$5();
                  _$insert(_el$0, comment);
                  return _el$0;
                })()
              }), null);
              _$effect(_$p => _$classList(_el$2, {
                "group shrink-0 d-flex flex-column rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover": true,
                "bg-primary-subtle shadow-xs-border-hover": selected,
                "bg-body": !selected
              }, _$p));
              return _el$2;
            }
          });
        }
      }));
      return _el$;
    }
  });
};
_$delegateEvents(["click"]);