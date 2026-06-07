import { template as _$template } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span class="relative inline-flex size-4 shrink-0">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-x-1.5 min-w-0"><span class="fw-medium truncate">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="h-full d-flex align-items-center"><div class=relative>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span class="text-warning small ms-1" title="未保存の変更" aria-hidden="true">●`);
import { createMemo, Show } from "solid-js";
import { createSortable } from "@thisbeyond/solid-dnd";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TooltipKeybind } from "@/bs/tooltip.js";
import { Tabs } from "@/bs/tabs.js";
import { getFilename } from "core/util/path";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useCommand } from "@/context/command.js";
import { useEditorDirty } from "@/lib/editor-dirty.js";
export function FileVisual(props) {
  const editorDirty = useEditorDirty();
  return (() => {
    var _el$ = _tmpl$2(),
      _el$3 = _el$.firstChild;
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !props.active;
      },
      get fallback() {
        return _$createComponent(FileIcon, {
          get node() {
            return {
              path: props.path,
              type: "file"
            };
          },
          "class": "size-4 shrink-0"
        });
      },
      get children() {
        var _el$2 = _tmpl$();
        _$insert(_el$2, _$createComponent(FileIcon, {
          get node() {
            return {
              path: props.path,
              type: "file"
            };
          },
          "class": "absolute inset-0 size-4 tab-fileicon-color"
        }), null);
        _$insert(_el$2, _$createComponent(FileIcon, {
          get node() {
            return {
              path: props.path,
              type: "file"
            };
          },
          mono: true,
          "class": "absolute inset-0 size-4 tab-fileicon-mono"
        }), null);
        return _el$2;
      }
    }), _el$3);
    _$insert(_el$3, () => getFilename(props.path));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return editorDirty.isDirty(props.path);
      },
      get children() {
        return _tmpl$4();
      }
    }), null);
    return _el$;
  })();
}
export function SortableTab(props) {
  const file = useFile();
  const language = useLanguage();
  const command = useCommand();
  const sortable = createSortable(props.tab);
  const path = createMemo(() => file.pathFromTab(props.tab));
  const content = createMemo(() => {
    const value = path();
    if (!value) return;
    return _$createComponent(FileVisual, {
      path: value
    });
  });
  return (() => {
    var _el$4 = _tmpl$3(),
      _el$5 = _el$4.firstChild;
    _$use(sortable, _el$4, () => true);
    _$insert(_el$5, _$createComponent(Tabs.Trigger, {
      get value() {
        return props.tab;
      },
      get closeButton() {
        return _$createComponent(TooltipKeybind, {
          get title() {
            return language.t("common.closeTab");
          },
          get keybind() {
            return command.keybind("tab.close");
          },
          placement: "bottom",
          gutter: 10,
          get children() {
            return _$createComponent(IconButton, {
              icon: "close-small",
              variant: "ghost",
              "class": "h-5 w-5",
              onClick: () => props.onTabClose(props.tab),
              get ["aria-label"]() {
                return language.t("common.closeTab");
              }
            });
          }
        });
      },
      hideCloseButton: true,
      onMiddleClick: () => props.onTabClose(props.tab),
      get children() {
        return _$createComponent(Show, {
          get when() {
            return content();
          },
          children: value => value()
        });
      }
    }));
    _$effect(() => _el$4.classList.toggle("opacity-0", !!sortable.isActiveDraggable));
    return _el$4;
  })();
}