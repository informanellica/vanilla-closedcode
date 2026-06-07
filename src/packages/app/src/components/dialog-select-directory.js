import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between rounded-2"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center min-w-0"><span class="text-body-emphasis whitespace-nowrap">~</span><span class="text-secondary whitespace-nowrap">/`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between rounded-2"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center min-w-0"><span class="text-secondary whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0"></span><span class="text-body-emphasis whitespace-nowrap"></span><span class="text-secondary whitespace-nowrap">/`);
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { List } from "@/bs/list.js";
import { getDirectory, getFilename } from "core/util/path";
import { createSignal } from "solid-js";
import { cleanInput, displayPath, useProjectController } from "@/controllers/project.js";
import { useLanguage } from "@/context/language.js";
export function DialogSelectDirectory(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const controller = useProjectController();
  const home = controller.home;
  const items = controller.searchDirectories;
  const [filter, setFilter] = createSignal("");
  let list;
  function resolve(absolute) {
    props.onSelect(props.multiple ? [absolute] : absolute);
    dialog.close();
  }
  return _$createComponent(Dialog, {
    get title() {
      return props.title ?? language.t("command.project.open");
    },
    get children() {
      return _$createComponent(List, {
        get search() {
          return {
            placeholder: language.t("dialog.directory.search.placeholder"),
            autofocus: true
          };
        },
        get emptyMessage() {
          return language.t("dialog.directory.empty");
        },
        get loadingMessage() {
          return language.t("common.loading");
        },
        items: items,
        key: x => x.absolute,
        filterKeys: ["search"],
        groupBy: item => item.group,
        sortGroupsBy: (a, b) => {
          if (a.category === b.category) return 0;
          return a.category === "recent" ? -1 : 1;
        },
        groupHeader: group => group.category === "recent" ? language.t("home.recentProjects") : language.t("command.project.open"),
        ref: r => list = r,
        onFilter: value => setFilter(cleanInput(value)),
        onKeyEvent: (e, item) => {
          if (e.key !== "Tab") return;
          if (e.shiftKey) return;
          if (!item) return;
          e.preventDefault();
          e.stopPropagation();
          const value = displayPath(item.absolute, filter(), home());
          list?.setFilter(value.endsWith("/") ? value : value + "/");
        },
        onSelect: path => {
          if (!path) return;
          resolve(path.absolute);
        },
        children: item => {
          const path = displayPath(item.absolute, filter(), home());
          if (path === "~") {
            return (() => {
              var _el$ = _tmpl$(),
                _el$2 = _el$.firstChild,
                _el$3 = _el$2.firstChild;
              _$insert(_el$2, _$createComponent(FileIcon, {
                get node() {
                  return {
                    path: item.absolute,
                    type: "directory"
                  };
                },
                "class": "shrink-0 size-4"
              }), _el$3);
              return _el$;
            })();
          }
          return (() => {
            var _el$4 = _tmpl$2(),
              _el$5 = _el$4.firstChild,
              _el$6 = _el$5.firstChild,
              _el$7 = _el$6.firstChild,
              _el$8 = _el$7.nextSibling;
            _$insert(_el$5, _$createComponent(FileIcon, {
              get node() {
                return {
                  path: item.absolute,
                  type: "directory"
                };
              },
              "class": "shrink-0 size-4"
            }), _el$6);
            _$insert(_el$7, () => getDirectory(path));
            _$insert(_el$8, () => getFilename(path));
            return _el$4;
          })();
        }
      });
    }
  });
}