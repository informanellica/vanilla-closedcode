import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { List } from "@/bs/list.js";
import { getDirectory, getFilename } from "core/util/path";
import { createComponent, createSignal } from "../lib/reactivity.js";
import { cleanInput, displayPath, useProjectController } from "@/controllers/project.js";
import { useLanguage } from "@/context/language.js";

// Build a detached element from a static HTML skeleton. The markup is kept
// whitespace-free between tags so the DOM matches the compiled template
// output exactly.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Row for the home directory: static "~/" label.
const HOME_ROW_HTML = `<div class="w-100 d-flex align-items-center justify-content-between rounded-2"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center min-w-0" data-slot="path"><span class="text-body-emphasis whitespace-nowrap">~</span><span class="text-secondary whitespace-nowrap">/</span></div></div></div>`;
// Row for any other directory: truncated parent path, emphasized basename
// and a trailing slash.
const PATH_ROW_HTML = `<div class="w-100 d-flex align-items-center justify-content-between rounded-2"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center min-w-0" data-slot="path"><span class="text-secondary whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0" data-slot="directory"></span><span class="text-body-emphasis whitespace-nowrap" data-slot="filename"></span><span class="text-secondary whitespace-nowrap">/</span></div></div></div>`;

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
  // Per-item row renderer for List. `path` is fixed for a render pass (List
  // rebuilds every row when the filter changes), so plain textContent is
  // equivalent to the compiled insert() of a non-reactive expression.
  function buildRow(item) {
    const path = displayPath(item.absolute, filter(), home());
    const row = template(path === "~" ? HOME_ROW_HTML : PATH_ROW_HTML);
    const pathBox = row.querySelector('[data-slot="path"]');
    pathBox.parentElement.insertBefore(
      createComponent(FileIcon, {
        get node() {
          return {
            path: item.absolute,
            type: "directory"
          };
        },
        class: "shrink-0 size-4"
      }),
      pathBox
    );
    if (path !== "~") {
      row.querySelector('[data-slot="directory"]').textContent = getDirectory(path);
      row.querySelector('[data-slot="filename"]').textContent = getFilename(path);
    }
    return row;
  }
  return createComponent(Dialog, {
    get title() {
      return props.title ?? language.t("command.project.open");
    },
    get children() {
      return createComponent(List, {
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
        children: item => buildRow(item)
      });
    }
  });
}
