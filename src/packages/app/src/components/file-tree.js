import { template as _$template } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span class="shrink-0 w-4 text-center small fw-medium">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="shrink-0 size-1.5 mr-1.5 rounded-circle">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-component=filetree>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="size-4 d-flex align-items-center justify-content-center text-secondary">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="w-4 shrink-0">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span class="filetree-iconpair size-4">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="px-2 py-1 small fw-normal text-secondary">...`);
import { useFile } from "@/context/file.js";
import { encodeFilePath } from "@/context/file/path.js";
import { Collapsible } from "@/bs/collapsible.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { createEffect, createMemo, For, Match, on, Show, splitProps, Switch, untrack } from "solid-js";
import { Dynamic } from "solid-js/web";
const MAX_DEPTH = 128;
function pathToFileUrl(filepath) {
  return `file://${encodeFilePath(filepath)}`;
}
export function shouldListRoot(input) {
  if (input.level !== 0) return false;
  if (input.dir?.loaded) return false;
  if (input.dir?.loading) return false;
  return true;
}
export function shouldListExpanded(input) {
  if (input.level === 0) return false;
  if (!input.dir?.expanded) return false;
  if (input.dir.loaded) return false;
  if (input.dir.loading) return false;
  return true;
}
export function dirsToExpand(input) {
  if (input.level !== 0) return [];
  if (!input.filter) return [];
  return [...input.filter.dirs].filter(dir => !input.expanded(dir));
}
const kindLabel = kind => {
  if (kind === "add") return "A";
  if (kind === "del") return "D";
  return "M";
};
const kindTextColor = kind => {
  if (kind === "add") return "color: var(--icon-diff-add-base)";
  if (kind === "del") return "color: var(--icon-diff-delete-base)";
  return "color: var(--icon-diff-modified-base)";
};
const kindDotColor = kind => {
  if (kind === "add") return "background-color: var(--icon-diff-add-base)";
  if (kind === "del") return "background-color: var(--icon-diff-delete-base)";
  return "background-color: var(--icon-diff-modified-base)";
};
// Diff maps/sets are keyed by normalized paths ("/" separators, no trailing
// slash), but node.path uses OS separators on Windows — so look up with a
// normalized key, or every nested entry misses and only top-level names
// (which contain no separator) ever show their marker.
const diffKey = p => p.replaceAll("\\", "/").replace(/\/+$/, "");
const visibleKind = (node, kinds, marks) => {
  const key = diffKey(node.path);
  const kind = kinds?.get(key);
  if (!kind) return;
  if (!marks?.has(key)) return;
  return kind;
};
const buildDragImage = target => {
  const icon = target.querySelector('[data-component="file-icon"]') ?? target.querySelector("svg");
  const text = target.querySelector("span");
  if (!icon || !text) return;
  const image = document.createElement("div");
  image.className = "d-flex align-items-center gap-x-2 px-2 py-1 bg-body-tertiary rounded-2 border small fw-normal text-body-emphasis";
  image.style.position = "absolute";
  image.style.top = "-1000px";
  image.innerHTML = icon.outerHTML + text.outerHTML;
  return image;
};
const withFileDragImage = event => {
  const image = buildDragImage(event.currentTarget);
  if (!image) return;
  document.body.appendChild(image);
  event.dataTransfer?.setDragImage(image, 0, 12);
  setTimeout(() => document.body.removeChild(image), 0);
};
const FileTreeNode = p => {
  const [local, rest] = splitProps(p, ["node", "level", "active", "nodeClass", "draggable", "kinds", "marks", "as", "children", "class", "classList"]);
  const kind = () => visibleKind(local.node, local.kinds, local.marks);
  const active = () => !!kind() && !local.node.ignored;
  const color = () => {
    const value = kind();
    if (!value) return;
    return kindTextColor(value);
  };
  return _$createComponent(Dynamic, _$mergeProps({
    get component() {
      return local.as ?? "div";
    },
    get classList() {
      return {
        "w-100 min-w-0 h-6 d-flex align-items-center justify-content-start gap-x-1.5 rounded-2 px-1.5 py-0 text-left transition-colors cursor-pointer": true,
        "bg-body-tertiary": local.node.path === local.active,
        ...local.classList,
        [local.class ?? ""]: !!local.class,
        [local.nodeClass ?? ""]: !!local.nodeClass
      };
    },
    get style() {
      // Files and directories share the same indent so a file's icon sits in the
      // chevron column and file names left-align with sibling folder names (a
      // file has no chevron; its type icon takes that slot — see the removed
      // spacer below).
      return `padding-left: ${Math.max(0, 8 + local.level * 12 - 4)}px`;
    },
    get draggable() {
      return local.draggable;
    },
    onDragStart: event => {
      if (!local.draggable) return;
      event.dataTransfer?.setData("text/plain", `file:${local.node.path}`);
      event.dataTransfer?.setData("text/uri-list", pathToFileUrl(local.node.path));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      withFileDragImage(event);
    }
  }, rest, {
    get children() {
      return [_$memo(() => local.children), (() => {
        var _el$ = _tmpl$();
        _$insert(_el$, () => local.node.name);
        _$effect(_p$ => {
          var _v$ = {
              "flex-1 min-w-0 small fw-medium whitespace-nowrap truncate": true,
              "text-body-secondary": local.node.ignored,
              "text-secondary": !local.node.ignored && !active()
            },
            _v$2 = active() ? color() : undefined;
          _p$.e = _$classList(_el$, _v$, _p$.e);
          _p$.t = _$style(_el$, _v$2, _p$.t);
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$;
      })(), _$memo(() => (() => {
        const value = kind();
        if (!value) return null;
        if (local.node.type === "file") {
          return (() => {
            var _el$2 = _tmpl$2();
            _$insert(_el$2, () => kindLabel(value));
            _$effect(_$p => _$style(_el$2, kindTextColor(value), _$p));
            return _el$2;
          })();
        }
        return (() => {
          var _el$3 = _tmpl$3();
          _$effect(_$p => _$style(_el$3, kindDotColor(value), _$p));
          return _el$3;
        })();
      })())];
    }
  }));
};
export default function FileTree(props) {
  const file = useFile();
  const level = props.level ?? 0;
  const draggable = () => props.draggable ?? true;
  const key = p => file.normalize(p).replace(/[\\/]+$/, "").replaceAll("\\", "/");
  const chain = props._chain ? [...props._chain, key(props.path)] : [key(props.path)];
  const filter = createMemo(() => {
    if (props._filter) return props._filter;
    const allowed = props.allowed;
    if (!allowed) return;
    const files = new Set(allowed);
    const dirs = new Set();
    for (const item of allowed) {
      const parts = item.split("/");
      const parents = parts.slice(0, -1);
      for (const [idx] of parents.entries()) {
        const dir = parents.slice(0, idx + 1).join("/");
        if (dir) dirs.add(dir);
      }
    }
    return {
      files,
      dirs
    };
  });
  const marks = createMemo(() => {
    if (props._marks) return props._marks;
    const out = new Set();
    for (const item of props.modified ?? []) out.add(item);
    for (const item of props.kinds?.keys() ?? []) out.add(item);
    if (out.size === 0) return;
    return out;
  });
  const kinds = createMemo(() => {
    if (props._kinds) return props._kinds;
    return props.kinds;
  });
  const deeps = createMemo(() => {
    if (props._deeps) return props._deeps;
    const out = new Map();
    const root = props.path;
    if (!(file.tree.state(root)?.expanded ?? false)) return out;
    const seen = new Set();
    const stack = [];
    const push = (dir, lvl) => {
      const id = key(dir);
      if (seen.has(id)) return;
      seen.add(id);
      const kids = file.tree.children(dir).filter(node => node.type === "directory" && (file.tree.state(node.path)?.expanded ?? false)).map(node => node.path);
      stack.push({
        dir,
        lvl,
        i: 0,
        kids,
        max: lvl
      });
    };
    push(root, level - 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.i < top.kids.length) {
        const next = top.kids[top.i];
        top.i++;
        push(next, top.lvl + 1);
        continue;
      }
      out.set(top.dir, top.max);
      stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      parent.max = Math.max(parent.max, top.max);
    }
    return out;
  });
  createEffect(() => {
    const current = filter();
    const dirs = dirsToExpand({
      level,
      filter: current,
      expanded: dir => untrack(() => file.tree.state(dir)?.expanded) ?? false
    });
    for (const dir of dirs) file.tree.expand(dir);
  });
  createEffect(on(() => props.path, path => {
    const dir = untrack(() => file.tree.state(path));
    if (!shouldListRoot({
      level,
      dir
    })) return;
    void file.tree.list(path);
  }, {
    defer: false
  }));
  const nodes = createMemo(() => {
    const nodes = file.tree.children(props.path);
    const current = filter();
    if (!current) return nodes;
    const parent = path => {
      const idx = path.lastIndexOf("/");
      if (idx === -1) return "";
      return path.slice(0, idx);
    };
    const leaf = path => {
      const idx = path.lastIndexOf("/");
      return idx === -1 ? path : path.slice(idx + 1);
    };
    const out = nodes.filter(node => {
      if (node.type === "file") return current.files.has(node.path);
      return current.dirs.has(node.path);
    });
    const seen = new Set(out.map(node => node.path));
    for (const dir of current.dirs) {
      if (parent(dir) !== props.path) continue;
      if (seen.has(dir)) continue;
      out.push({
        name: leaf(dir),
        path: dir,
        absolute: dir,
        type: "directory",
        ignored: false
      });
      seen.add(dir);
    }
    for (const item of current.files) {
      if (parent(item) !== props.path) continue;
      if (seen.has(item)) continue;
      out.push({
        name: leaf(item),
        path: item,
        absolute: item,
        type: "file",
        ignored: false
      });
      seen.add(item);
    }
    out.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return out;
  });
  return (() => {
    var _el$4 = _tmpl$4();
    _$insert(_el$4, _$createComponent(For, {
      get each() {
        return nodes();
      },
      children: node => {
        const expanded = () => file.tree.state(node.path)?.expanded ?? false;
        const deep = () => deeps().get(node.path) ?? -1;
        const kind = () => visibleKind(node, kinds(), marks());
        const active = () => !!kind() && !node.ignored;
        return _$createComponent(Switch, {
          get children() {
            return [_$createComponent(Match, {
              get when() {
                return node.type === "directory";
              },
              get children() {
                return _$createComponent(Collapsible, {
                  variant: "ghost",
                  "class": "w-100",
                  "data-scope": "filetree",
                  forceMount: false,
                  get open() {
                    return expanded();
                  },
                  onOpenChange: open => open ? file.tree.expand(node.path) : file.tree.collapse(node.path),
                  get children() {
                    return [_$createComponent(Collapsible.Trigger, {
                      get children() {
                        return _$createComponent(FileTreeNode, {
                          node: node,
                          level: level,
                          get active() {
                            return props.active;
                          },
                          get nodeClass() {
                            return props.nodeClass;
                          },
                          get draggable() {
                            return draggable();
                          },
                          get kinds() {
                            return kinds();
                          },
                          get marks() {
                            return marks();
                          },
                          onContextMenu: e => props.onContextMenu?.(node, e),
                          get children() {
                            var _el$5 = _tmpl$5();
                            _$insert(_el$5, _$createComponent(Icon, {
                              get name() {
                                return expanded() ? "chevron-down" : "chevron-right";
                              },
                              size: "small"
                            }));
                            return _el$5;
                          }
                        });
                      }
                    }), _$createComponent(Collapsible.Content, {
                      "class": "relative pt-0.5",
                      get children() {
                        return [(() => {
                          var _el$6 = _tmpl$6();
                          _$effect(_p$ => {
                            var _v$3 = {
                                "absolute top-0 bottom-0 w-px pointer-events-none bg-border-weak-base opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none": true,
                                "group-hover/filetree:opacity-100": expanded() && deep() === level,
                                "group-hover/filetree:opacity-50": !(expanded() && deep() === level)
                              },
                              _v$4 = `left: ${Math.max(0, 8 + level * 12 - 4) + 8}px`;
                            _p$.e = _$classList(_el$6, _v$3, _p$.e);
                            _p$.t = _$style(_el$6, _v$4, _p$.t);
                            return _p$;
                          }, {
                            e: undefined,
                            t: undefined
                          });
                          return _el$6;
                        })(), _$createComponent(Show, {
                          get when() {
                            return level < MAX_DEPTH && !chain.includes(key(node.path));
                          },
                          get fallback() {
                            return _tmpl$9();
                          },
                          get children() {
                            return _$createComponent(FileTree, {
                              get path() {
                                return node.path;
                              },
                              level: level + 1,
                              get allowed() {
                                return props.allowed;
                              },
                              get modified() {
                                return props.modified;
                              },
                              get kinds() {
                                return props.kinds;
                              },
                              get active() {
                                return props.active;
                              },
                              get draggable() {
                                return props.draggable;
                              },
                              get onFileClick() {
                                return props.onFileClick;
                              },
                              get _filter() {
                                return filter();
                              },
                              get _marks() {
                                return marks();
                              },
                              get _deeps() {
                                return deeps();
                              },
                              get _kinds() {
                                return kinds();
                              },
                              _chain: chain
                            });
                          }
                        })];
                      }
                    })];
                  }
                });
              }
            }), _$createComponent(Match, {
              get when() {
                return node.type === "file";
              },
              get children() {
                return _$createComponent(FileTreeNode, {
                  node: node,
                  level: level,
                  get active() {
                    return props.active;
                  },
                  get nodeClass() {
                    return props.nodeClass;
                  },
                  get draggable() {
                    return draggable();
                  },
                  get kinds() {
                    return kinds();
                  },
                  get marks() {
                    return marks();
                  },
                  as: "button",
                  type: "button",
                  // Open on double-click (single click just selects/focuses).
                  onDblClick: () => props.onFileClick?.(node),
                  onContextMenu: e => props.onContextMenu?.(node, e),
                  get children() {
                    // No chevron spacer for files — the type icon takes the
                    // chevron column so names align with sibling folders.
                    return [_$createComponent(Switch, {
                      get children() {
                        return [_$createComponent(Match, {
                          get when() {
                            return node.ignored;
                          },
                          get children() {
                            return _$createComponent(FileIcon, {
                              node: node,
                              "class": "size-4 filetree-icon filetree-icon--mono",
                              style: "color: var(--icon-weak-base)",
                              mono: true
                            });
                          }
                        }), _$createComponent(Match, {
                          get when() {
                            return active();
                          },
                          get children() {
                            return _$createComponent(FileIcon, {
                              node: node,
                              "class": "size-4 filetree-icon filetree-icon--mono",
                              get style() {
                                return kindTextColor(kind());
                              },
                              mono: true
                            });
                          }
                        }), _$createComponent(Match, {
                          get when() {
                            return !node.ignored;
                          },
                          get children() {
                            var _el$8 = _tmpl$8();
                            _$insert(_el$8, _$createComponent(FileIcon, {
                              node: node,
                              "class": "size-4 filetree-icon filetree-icon--color opacity-0 group-hover/filetree:opacity-100"
                            }), null);
                            _$insert(_el$8, _$createComponent(FileIcon, {
                              node: node,
                              "class": "size-4 filetree-icon filetree-icon--mono group-hover/filetree:opacity-0",
                              mono: true
                            }), null);
                            return _el$8;
                          }
                        })];
                      }
                    })];
                  }
                });
              }
            })];
          }
        });
      }
    }));
    _$effect(() => _$className(_el$4, `d-flex flex-column gap-0.5 ${props.class ?? ""}`));
    return _el$4;
  })();
}