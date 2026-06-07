import { template as _$template } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span class="text-secondary truncate">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between gap-4"><div class="d-flex align-items-center gap-2 min-w-0"><span class="text-body-emphasis whitespace-nowrap">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span class="small fw-normal text-secondary whitespace-nowrap ml-2">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between rounded-2 pl-1"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center gap-2 min-w-0"><span class="text-body-emphasis truncate">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between rounded-2 pl-1"><div class="d-flex align-items-center gap-x-3 grow min-w-0"><div class="d-flex align-items-center"><span class="text-secondary whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0"></span><span class="text-body-emphasis whitespace-nowrap">`);
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { Keybind } from "@/vendor/ui/components/keybind.js";
import { List } from "@/bs/list.js";
import { base64Encode } from "core/util/encode";
import { getDirectory, getFilename } from "core/util/path";
import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { formatKeybind, useCommand } from "@/context/command.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLayout } from "@/context/layout.js";
import { useLayoutController } from "@/controllers/layout.js";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { createSessionTabs } from "@/pages/session/helpers.js";
import { decode64 } from "@/utils/base64.js";
import { getRelativeTime } from "@/utils/time.js";
const ENTRY_LIMIT = 5;
const COMMON_COMMAND_IDS = ["session.new", "workspace.new", "session.previous", "session.next", "terminal.toggle", "review.toggle"];
const uniqueEntries = items => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};
const createCommandEntry = (option, category) => ({
  id: "command:" + option.id,
  type: "command",
  title: option.title,
  description: option.description,
  keybind: option.keybind,
  category,
  option
});
const createFileEntry = (path, category) => ({
  id: "file:" + path,
  type: "file",
  title: path,
  category,
  path
});
const createSessionEntry = (input, category) => ({
  id: `session:${input.directory}:${input.id}`,
  type: "session",
  title: input.title,
  description: input.description,
  category,
  directory: input.directory,
  sessionID: input.id,
  archived: input.archived,
  updated: input.updated
});
function createCommandEntries(props) {
  const allowed = createMemo(() => {
    if (props.filesOnly()) return [];
    return props.command.options.filter(option => !option.disabled && !option.id.startsWith("suggested.") && option.id !== "file.open");
  });
  const list = createMemo(() => {
    const category = props.language.t("palette.group.commands");
    return allowed().map(option => createCommandEntry(option, category));
  });
  const picks = createMemo(() => {
    const all = allowed();
    const order = new Map(COMMON_COMMAND_IDS.map((id, index) => [id, index]));
    const picked = all.filter(option => order.has(option.id));
    const base = picked.length ? picked : all.slice(0, ENTRY_LIMIT);
    const sorted = picked.length ? [...base].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) : base;
    const category = props.language.t("palette.group.commands");
    return sorted.map(option => createCommandEntry(option, category));
  });
  return {
    allowed,
    list,
    picks
  };
}
function createFileEntries(props) {
  const tabState = createSessionTabs({
    tabs: props.tabs,
    pathFromTab: props.file.pathFromTab,
    normalizeTab: tab => tab.startsWith("file://") ? props.file.tab(tab) : tab
  });
  const recent = createMemo(() => {
    const all = tabState.openedTabs();
    const active = tabState.activeFileTab();
    const order = active ? [active, ...all.filter(item => item !== active)] : all;
    const seen = new Set();
    const category = props.language.t("palette.group.files");
    const items = [];
    for (const item of order) {
      const path = props.file.pathFromTab(item);
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      items.push(createFileEntry(path, category));
    }
    return items.slice(0, ENTRY_LIMIT);
  });
  const root = createMemo(() => {
    const category = props.language.t("palette.group.files");
    const nodes = props.file.tree.children("");
    const paths = nodes.filter(node => node.type === "file").map(node => node.path).sort((a, b) => a.localeCompare(b));
    return paths.slice(0, ENTRY_LIMIT).map(path => createFileEntry(path, category));
  });
  return {
    recent,
    root
  };
}
function createSessionEntries(props) {
  const state = {
    token: 0,
    inflight: undefined,
    cached: undefined
  };
  const sessions = text => {
    const query = text.trim();
    if (!query) {
      state.token += 1;
      state.inflight = undefined;
      state.cached = undefined;
      return [];
    }
    if (state.cached) return state.cached;
    if (state.inflight) return state.inflight;
    const current = state.token;
    const dirs = props.workspaces();
    if (dirs.length === 0) return [];
    state.inflight = Promise.all(dirs.map(directory => {
      const description = props.label(directory);
      return props.listSessions(directory).then(list => list.map(s => ({
        id: s.id,
        title: s.title ?? props.language.t("command.session.new"),
        description,
        directory,
        archived: s.time?.archived,
        updated: s.time?.updated
      }))).catch(() => []);
    })).then(results => {
      if (state.token !== current) return [];
      const seen = new Set();
      const category = props.language.t("command.category.session");
      const next = results.flat().filter(item => {
        const key = `${item.directory}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(item => createSessionEntry(item, category));
      state.cached = next;
      return next;
    }).catch(() => []).finally(() => {
      state.inflight = undefined;
    });
    return state.inflight;
  };
  return {
    sessions
  };
}
export function DialogSelectFile(props) {
  const command = useCommand();
  const language = useLanguage();
  const layout = useLayout();
  const file = useFile();
  const dialog = useDialog();
  const navigate = useNavigate();
  const globalSync = useGlobalSync();
  const {
    params,
    tabs,
    view
  } = useSessionLayout();
  const controller = useLayoutController({
    params
  });
  const filesOnly = () => props.mode === "files";
  const state = {
    cleanup: undefined,
    committed: false
  };
  const [grouped, setGrouped] = createSignal(false);
  const commandEntries = createCommandEntries({
    filesOnly,
    command,
    language
  });
  const fileEntries = createFileEntries({
    file,
    tabs,
    language
  });
  const projectDirectory = createMemo(() => decode64(params.dir) ?? "");
  const project = createMemo(() => {
    const directory = projectDirectory();
    if (!directory) return;
    return layout.projects.list().find(p => p.worktree === directory || p.sandboxes?.includes(directory));
  });
  const workspaces = createMemo(() => {
    const directory = projectDirectory();
    const current = project();
    if (!current) return directory ? [directory] : [];
    const dirs = [current.worktree, ...(current.sandboxes ?? [])];
    if (directory && !dirs.includes(directory)) return [...dirs, directory];
    return dirs;
  });
  const homedir = createMemo(() => globalSync.data.path.home);
  const label = directory => {
    const current = project();
    const kind = current && directory === current.worktree ? language.t("workspace.type.local") : language.t("workspace.type.sandbox");
    const [store] = globalSync.child(directory, {
      bootstrap: false
    });
    const home = homedir();
    const path = home ? directory.replace(home, "~") : directory;
    const name = store.vcs?.branch ?? getFilename(directory);
    return `${kind} : ${name || path}`;
  };
  const {
    sessions
  } = createSessionEntries({
    workspaces,
    label,
    listSessions: controller.listSessions,
    language
  });
  const items = async text => {
    const query = text.trim();
    setGrouped(query.length > 0);
    if (!query && filesOnly()) {
      const loaded = file.tree.state("")?.loaded;
      const pending = loaded ? Promise.resolve() : file.tree.list("");
      const next = uniqueEntries([...fileEntries.recent(), ...fileEntries.root()]);
      if (loaded || next.length > 0) {
        void pending;
        return next;
      }
      await pending;
      return uniqueEntries([...fileEntries.recent(), ...fileEntries.root()]);
    }
    if (!query) return [...commandEntries.picks(), ...fileEntries.recent()];
    if (filesOnly()) {
      const files = await file.searchFiles(query);
      const category = language.t("palette.group.files");
      return files.map(path => createFileEntry(path, category));
    }
    const [files, nextSessions] = await Promise.all([file.searchFiles(query), Promise.resolve(sessions(query))]);
    const category = language.t("palette.group.files");
    const entries = files.map(path => createFileEntry(path, category));
    return [...commandEntries.list(), ...nextSessions, ...entries];
  };
  const handleMove = item => {
    state.cleanup?.();
    if (!item) return;
    if (item.type !== "command") return;
    state.cleanup = item.option?.onHighlight?.();
  };
  const open = path => {
    const value = file.tab(path);
    void tabs().open(value);
    void file.load(path);
    if (!view().reviewPanel.opened()) view().reviewPanel.open();
    layout.fileTree.setTab("all");
    props.onOpenFile?.(path);
    tabs().setActive(value);
  };
  const handleSelect = item => {
    if (!item) return;
    state.committed = true;
    state.cleanup = undefined;
    dialog.close();
    if (item.type === "command") {
      item.option?.onSelect?.("palette");
      return;
    }
    if (item.type === "session") {
      if (!item.directory || !item.sessionID) return;
      navigate(`/${base64Encode(item.directory)}/session/${item.sessionID}`);
      return;
    }
    if (!item.path) return;
    open(item.path);
  };
  onCleanup(() => {
    if (state.committed) return;
    state.cleanup?.();
  });
  return _$createComponent(Dialog, {
    "class": "pt-3 pb-0 !max-h-[480px]",
    transition: true,
    get children() {
      return _$createComponent(List, {
        get search() {
          return {
            placeholder: filesOnly() ? language.t("session.header.searchFiles") : language.t("palette.search.placeholder"),
            autofocus: true,
            hideIcon: true
          };
        },
        get emptyMessage() {
          return language.t("palette.empty");
        },
        get loadingMessage() {
          return language.t("common.loading");
        },
        items: items,
        key: item => item.id,
        filterKeys: ["title", "description", "category"],
        get groupBy() {
          return grouped() ? item => item.category : () => "";
        },
        onMove: handleMove,
        onSelect: handleSelect,
        children: item => _$createComponent(Switch, {
          get fallback() {
            return (() => {
              var _el$1 = _tmpl$5(),
                _el$10 = _el$1.firstChild,
                _el$11 = _el$10.firstChild,
                _el$12 = _el$11.firstChild,
                _el$13 = _el$12.nextSibling;
              _$insert(_el$10, _$createComponent(FileIcon, {
                get node() {
                  return {
                    path: item.path ?? "",
                    type: "file"
                  };
                },
                "class": "shrink-0 size-4"
              }), _el$11);
              _$insert(_el$12, () => getDirectory(item.path ?? ""));
              _$insert(_el$13, () => getFilename(item.path ?? ""));
              return _el$1;
            })();
          },
          get children() {
            return [_$createComponent(Match, {
              get when() {
                return item.type === "command";
              },
              get children() {
                var _el$ = _tmpl$2(),
                  _el$2 = _el$.firstChild,
                  _el$3 = _el$2.firstChild;
                _$insert(_el$3, () => item.title);
                _$insert(_el$2, _$createComponent(Show, {
                  get when() {
                    return item.description;
                  },
                  get children() {
                    var _el$4 = _tmpl$();
                    _$insert(_el$4, () => item.description);
                    return _el$4;
                  }
                }), null);
                _$insert(_el$, _$createComponent(Show, {
                  get when() {
                    return item.keybind;
                  },
                  get children() {
                    return _$createComponent(Keybind, {
                      "class": "rounded-[4px]",
                      get children() {
                        return formatKeybind(item.keybind ?? "", language.t);
                      }
                    });
                  }
                }), null);
                return _el$;
              }
            }), _$createComponent(Match, {
              get when() {
                return item.type === "session";
              },
              get children() {
                var _el$5 = _tmpl$4(),
                  _el$6 = _el$5.firstChild,
                  _el$7 = _el$6.firstChild,
                  _el$8 = _el$7.firstChild;
                _$insert(_el$6, _$createComponent(Icon, {
                  name: "bubble-5",
                  size: "small",
                  "class": "shrink-0 text-secondary"
                }), _el$7);
                _$insert(_el$8, () => item.title);
                _$insert(_el$7, _$createComponent(Show, {
                  get when() {
                    return item.description;
                  },
                  get children() {
                    var _el$9 = _tmpl$();
                    _$insert(_el$9, () => item.description);
                    _$effect(() => _el$9.classList.toggle("opacity-70", !!item.archived));
                    return _el$9;
                  }
                }), null);
                _$insert(_el$5, _$createComponent(Show, {
                  get when() {
                    return item.updated;
                  },
                  get children() {
                    var _el$0 = _tmpl$3();
                    _$insert(_el$0, () => getRelativeTime(new Date(item.updated).toISOString(), language.t));
                    return _el$0;
                  }
                }), null);
                _$effect(() => _el$8.classList.toggle("opacity-70", !!item.archived));
                return _el$5;
              }
            })];
          }
        })
      });
    }
  });
}