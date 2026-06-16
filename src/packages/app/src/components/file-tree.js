/** @file FileTree component: a recursive, collapsible file/directory tree with diff markers, drag-to-attach support and an optional allow-list filter. */
import { useFile } from "@/context/file.js";
import { encodeFilePath } from "@/context/file/path.js";
import { Collapsible } from "@/bs/collapsible.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { createComponent, createEffect, createMemo, createRenderEffect, For, Match, on, Show, splitProps, Switch, untrack } from "../lib/reactivity.js";

/**
 * Maximum recursion depth for nested FileTree rendering, guarding against runaway/circular trees.
 * @type {number}
 */
const MAX_DEPTH = 128;

/**
 * Build a file:// URL for a filesystem path.
 * @param {string} filepath - The path to encode.
 * @returns {string} The file URL.
 */
function pathToFileUrl(filepath) {
  return `file://${encodeFilePath(filepath)}`;
}

/**
 * Decide whether the root level of the tree should trigger an initial directory listing.
 * @param {Object} input - State with `level` (number) and `dir` (directory state with `loaded`/`loading`).
 * @returns {boolean} True when the root has not yet been (and is not currently being) listed.
 */
export function shouldListRoot(input) {
  if (input.level !== 0) return false;
  if (input.dir?.loaded) return false;
  if (input.dir?.loading) return false;
  return true;
}
/**
 * Decide whether an expanded directory needs its children listed.
 * @param {Object} input - State with `level` (number) and `dir` (directory state with `expanded`/`loaded`/`loading`).
 * @returns {boolean} True when a non-root, expanded directory has not yet been listed.
 */
export function shouldListExpanded(input) {
  if (input.level === 0) return false;
  if (!input.dir?.expanded) return false;
  if (input.dir.loaded) return false;
  if (input.dir.loading) return false;
  return true;
}
/**
 * At the root level, compute which filtered directories should be auto-expanded (those not already expanded).
 * @param {Object} input - State with `level` (number), `filter` (object with a `dirs` set, optional) and `expanded` (Function predicate).
 * @returns {Array} The directory paths to expand.
 */
export function dirsToExpand(input) {
  if (input.level !== 0) return [];
  if (!input.filter) return [];
  return [...input.filter.dirs].filter(dir => !input.expanded(dir));
}

/**
 * Map a diff kind to its single-letter label (A/D/M).
 * @param {string} kind - The diff kind ("add", "del" or other for modified).
 * @returns {string} The label letter.
 */
const kindLabel = kind => {
  if (kind === "add") return "A";
  if (kind === "del") return "D";
  return "M";
};
/**
 * Map a diff kind to an inline text-color style for the marker letter/icon.
 * @param {string} kind - The diff kind ("add", "del" or other for modified).
 * @returns {string} An inline CSS `color` declaration.
 */
const kindTextColor = kind => {
  if (kind === "add") return "color: var(--icon-diff-add-base)";
  if (kind === "del") return "color: var(--icon-diff-delete-base)";
  return "color: var(--icon-diff-modified-base)";
};

/**
 * Map a diff kind to an inline background-color style for the directory marker dot.
 * @param {string} kind - The diff kind ("add", "del" or other for modified).
 * @returns {string} An inline CSS `background-color` declaration.
 */
const kindDotColor = kind => {
  if (kind === "add") return "background-color: var(--icon-diff-add-base)";
  if (kind === "del") return "background-color: var(--icon-diff-delete-base)";
  return "background-color: var(--icon-diff-modified-base)";
};
// Diff maps/sets are keyed by normalized paths ("/" separators, no trailing
// slash), but node.path uses OS separators on Windows — so look up with a
// normalized key, or every nested entry misses and only top-level names
// (which contain no separator) ever show their marker.
/**
 * Normalize a node path into the key shape used by diff maps/sets ("/" separators, no trailing slash).
 * @param {string} p - The path to normalize.
 * @returns {string} The normalized diff key.
 */
const diffKey = p => p.replaceAll("\\", "/").replace(/\/+$/, "");

/**
 * Resolve the diff kind that should be displayed for a node, requiring both a known kind and an explicit mark.
 * @param {Object} node - The tree node (with `path`).
 * @param {Map} kinds - Map of normalized path to diff kind.
 * @param {Set} marks - Set of normalized paths that may show a marker.
 * @returns {string} The diff kind, or undefined when no marker should show.
 */
const visibleKind = (node, kinds, marks) => {
  const key = diffKey(node.path);
  const kind = kinds?.get(key);
  if (!kind) return;
  if (!marks?.has(key)) return;
  return kind;
};
/**
 * Build an off-screen drag image cloning a row's icon and name for use as the native drag preview.
 * @param {HTMLElement} target - The row element being dragged.
 * @returns {HTMLElement} The drag-image element, or undefined when the row lacks an icon or name.
 */
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
/**
 * Attach a custom drag image to a dragstart event, mounting it briefly so the browser can snapshot it.
 * @param {DragEvent} event - The dragstart event whose dataTransfer receives the drag image.
 * @returns {void}
 */
const withFileDragImage = event => {
  const image = buildDragImage(event.currentTarget);
  if (!image) return;
  document.body.appendChild(image);
  event.dataTransfer?.setDragImage(image, 0, 12);
  setTimeout(() => document.body.removeChild(image), 0);
};
/**
 * Diff-apply a Solid-style classList object onto an element, toggling only the keys that changed and leaving externally-set classes intact.
 * @param {HTMLElement} el - The element to update.
 * @param {Object} value - The next classList map (key may hold space-separated class names; truthy enables).
 * @param {Object} prev - The previously-applied classList map.
 * @returns {Object} A shallow copy of the applied map, to pass back as `prev` next time.
 */
// Diff-apply a Solid classList object, mirroring the compiled classList()
// helper: a key may hold several space-separated classes and only changed keys
// are touched, so classes applied elsewhere on the element survive.
function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.remove(cls);
    }
  }
  for (const name of Object.keys(nextObj)) {
    const enabled = !!nextObj[name];
    if (!name || enabled === !!prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.toggle(cls, enabled);
    }
  }
  return { ...nextObj };
}
/**
 * Flatten possibly-reactive children into an output array of Nodes, calling functions, recursing arrays and dropping null/boolean values; non-Node primitives become text nodes.
 * @param {Array} out - The accumulator array of Nodes to push into.
 * @param {*} value - A child value: Node, function, array, primitive or nullish.
 * @returns {void}
 */
// Flatten possibly-reactive children into `out`. Function values (the memos
// returned by For/Switch/Show) are called here, inside the caller's render
// effect, so branch flips re-run that effect; arrays recurse and
// null/boolean values are dropped — the same shapes solid-js/web's insert()
// resolved for this component.
function appendResolved(out, value) {
  if (value == null || typeof value === "boolean") return;
  if (typeof value === "function") {
    appendResolved(out, value());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) appendResolved(out, item);
    return;
  }
  out.push(value instanceof Node ? value : document.createTextNode(String(value)));
}
/**
 * Replace a parent's children with the given nodes, skipping the write entirely when the child list is already identical.
 * @param {Node} parent - The element whose children are synced.
 * @param {Array} next - The desired child nodes in order.
 * @returns {void}
 */
// Replace `parent`'s children with `next`, skipping the no-op case so re-runs
// that resolve to the same nodes do not detach and reattach them.
function syncChildren(parent, next) {
  const current = parent.childNodes;
  if (current.length === next.length) {
    let same = true;
    for (let i = 0; i < next.length; i++) {
      if (current[i] !== next[i]) {
        same = false;
        break;
      }
    }
    if (same) return;
  }
  parent.replaceChildren(...next);
}
/**
 * A single file-tree row (file or directory label) with indentation, drag support, name, diff marker and caller-supplied lead children (chevron/icon).
 * @param {Object} p - Row props: `node` (the tree node), `level` (depth), `active` (active path), `nodeClass`/`class`/`classList` (styling), `draggable` (boolean), `kinds`/`marks` (diff maps), `as` (element tag), `children` (lead content) plus forwarded rest props (e.g. `type`, `onDblClick`, `onContextMenu`).
 * @returns {HTMLElement} The row element.
 */
// Single row (file or directory label). The compiled version rendered this
// through solid-js/web's Dynamic + reactive spread; `as` and the leftover rest
// props (type / onDblClick / onContextMenu) are static at both call sites, so
// the element is created once and only the genuinely reactive bindings
// (classList, draggable, name, kind marker, caller children) get effects.
const FileTreeNode = p => {
  const [local, rest] = splitProps(p, ["node", "level", "active", "nodeClass", "draggable", "kinds", "marks", "as", "children", "class", "classList"]);
  const kind = () => visibleKind(local.node, local.kinds, local.marks);
  const active = () => !!kind() && !local.node.ignored;
  const color = () => {
    const value = kind();
    if (!value) return;
    return kindTextColor(value);
  };
  const el = document.createElement(local.as ?? "div");
  let elClasses;
  createRenderEffect(() => {
    elClasses = applyClassList(el, {
      "w-100 min-w-0 h-6 d-flex align-items-center justify-content-start gap-x-1.5 rounded-2 px-1.5 py-0 text-left transition-colors cursor-pointer": true,
      "bg-body-tertiary": local.node.path === local.active,
      ...local.classList,
      [local.class ?? ""]: !!local.class,
      [local.nodeClass ?? ""]: !!local.nodeClass
    }, elClasses);
  });
  // Files and directories share the same indent so a file's icon sits in the
  // chevron column and file names left-align with sibling folder names (a
  // file has no chevron; its type icon takes that slot — see the removed
  // spacer below). `level` is fixed per row, so the indent is set once.
  el.style.cssText = `padding-left: ${Math.max(0, 8 + local.level * 12 - 4)}px`;
  createRenderEffect(() => {
    el.draggable = !!local.draggable;
  });
  el.addEventListener("dragstart", event => {
    if (!local.draggable) return;
    event.dataTransfer?.setData("text/plain", `file:${local.node.path}`);
    event.dataTransfer?.setData("text/uri-list", pathToFileUrl(local.node.path));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    withFileDragImage(event);
  });
  // Remaining props are static at both call sites: on* handlers become
  // listeners, anything else an attribute (one-time, like the compiled spread
  // whose keys and values never changed here).
  for (const prop of Object.keys(rest)) {
    const value = rest[prop];
    if (value == null) continue;
    if (prop.startsWith("on") && typeof value === "function") {
      el.addEventListener(prop.slice(2).toLowerCase(), value);
      continue;
    }
    el.setAttribute(prop, String(value));
  }
  const name = document.createElement("span");
  createRenderEffect(() => {
    name.textContent = local.node.name;
  });
  let nameClasses;
  createRenderEffect(() => {
    nameClasses = applyClassList(name, {
      "flex-1 min-w-0 small fw-medium whitespace-nowrap truncate": true,
      "text-body-secondary": local.node.ignored,
      "text-secondary": !local.node.ignored && !active()
    }, nameClasses);
    const style = active() ? color() : undefined;
    if (style) name.style.cssText = style;
    else name.removeAttribute("style");
  });
  // Kind marker after the name: A/D/M letter for files, colored dot for
  // directories. Memoized so the marker node keeps its identity across
  // re-renders that do not change the kind.
  const marker = createMemo(() => {
    const value = kind();
    if (!value) return null;
    if (local.node.type === "file") {
      const label = document.createElement("span");
      label.className = "shrink-0 w-4 text-center small fw-medium";
      label.style.cssText = kindTextColor(value);
      label.textContent = kindLabel(value);
      return label;
    }
    const dot = document.createElement("div");
    dot.className = "shrink-0 size-1.5 mr-1.5 rounded-circle";
    dot.style.cssText = kindDotColor(value);
    return dot;
  });
  // Caller children (dir chevron / file icon Switch) lead, then the name,
  // then the marker — the same slot order the compiled insert produced. The
  // lead memo has no tracked dependencies (component creation is untracked),
  // matching the compiled memo(() => local.children) that froze it.
  const lead = createMemo(() => local.children);
  createRenderEffect(() => {
    const out = [];
    appendResolved(out, lead());
    out.push(name);
    appendResolved(out, marker());
    syncChildren(el, out);
  });
  return el;
};
/**
 * Recursive, collapsible file/directory tree component that lazily lists directories, renders diff markers and supports drag-to-attach and an optional allow-list filter.
 * @param {Object} props - Component props: `path` (root directory), `level` (depth, default 0), `allowed` (optional Array of allowed paths to filter by), `modified`/`kinds` (diff state), `active` (highlighted path), `draggable` (boolean), `nodeClass`/`class` (styling), `onFileClick`/`onContextMenu` (Function handlers) and internal `_filter`/`_marks`/`_deeps`/`_kinds`/`_chain` props threaded into nested instances.
 * @returns {HTMLElement} The tree container element.
 */
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
  const root = document.createElement("div");
  root.setAttribute("data-component", "filetree");
  // For keeps row identity per node reference, so expanding/collapsing or
  // marker changes never rebuild sibling rows — only genuine nodes() changes
  // re-run the row mapping, like the compiled insert(For) did.
  const rows = createComponent(For, {
    get each() {
      return nodes();
    },
    children: node => {
      const expanded = () => file.tree.state(node.path)?.expanded ?? false;
      const deep = () => deeps().get(node.path) ?? -1;
      const kind = () => visibleKind(node, kinds(), marks());
      const active = () => !!kind() && !node.ignored;
      return createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return node.type === "directory";
            },
            get children() {
              const collapsible = createComponent(Collapsible, {
                variant: "ghost",
                "class": "w-100",
                "data-scope": "filetree",
                forceMount: false,
                get open() {
                  return expanded();
                },
                onOpenChange: open => open ? file.tree.expand(node.path) : file.tree.collapse(node.path),
                get children() {
                  return [createComponent(Collapsible.Trigger, {
                    get children() {
                      return createComponent(FileTreeNode, {
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
                          const chevron = document.createElement("div");
                          chevron.className = "size-4 d-flex align-items-center justify-content-center text-secondary";
                          // The vanilla Icon reads `name` once at creation
                          // (no internal effects), so a live getter would
                          // freeze the chevron on its initial direction —
                          // rebuild the icon whenever expanded() flips. The
                          // effect is owned by the lead memo that resolves
                          // these children, so it disposes with the row.
                          createRenderEffect(() => {
                            chevron.replaceChildren(createComponent(Icon, {
                              name: expanded() ? "chevron-down" : "chevron-right",
                              size: "small"
                            }));
                          });
                          return chevron;
                        }
                      });
                    }
                  }), createComponent(Collapsible.Content, {
                    "class": "relative pt-0.5",
                    get children() {
                      // Vertical guide line; its emphasis tracks whether this
                      // branch is the deepest expanded one (live effect, the
                      // same classList the compiled output toggled).
                      const line = document.createElement("div");
                      line.style.cssText = `left: ${Math.max(0, 8 + level * 12 - 4) + 8}px`;
                      let lineClasses;
                      createRenderEffect(() => {
                        lineClasses = applyClassList(line, {
                          "absolute top-0 bottom-0 w-px pointer-events-none bg-border-weak-base opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none": true,
                          "group-hover/filetree:opacity-100": expanded() && deep() === level,
                          "group-hover/filetree:opacity-50": !(expanded() && deep() === level)
                        }, lineClasses);
                      });
                      return [line, createComponent(Show, {
                        get when() {
                          return level < MAX_DEPTH && !chain.includes(key(node.path));
                        },
                        get fallback() {
                          const depth = document.createElement("div");
                          depth.className = "px-2 py-1 small fw-normal text-secondary";
                          depth.textContent = "...";
                          return depth;
                        },
                        get children() {
                          return createComponent(FileTree, {
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
              // The vanilla Collapsible re-applies its open-state attributes
              // only on its own trigger clicks; the original compiled
              // version tracked the controlled `open` prop live. Re-sync
              // whenever expanded() changes so externally driven expands
              // (the `allowed` auto-expand effect above, tree state restored
              // across remounts) actually show/hide the content — this also
              // applies the initial attributes (incl. `hidden` on a collapsed
              // content), which CollapsibleRoot itself sets only before its
              // children exist.
              createRenderEffect(() => {
                expanded();
                collapsible.__collapsibleUpdate?.();
              });
              return collapsible;
            }
          }), createComponent(Match, {
            get when() {
              return node.type === "file";
            },
            get children() {
              return createComponent(FileTreeNode, {
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
                  return [createComponent(Switch, {
                    get children() {
                      return [createComponent(Match, {
                        get when() {
                          return node.ignored;
                        },
                        get children() {
                          return createComponent(FileIcon, {
                            node: node,
                            "class": "size-4 filetree-icon filetree-icon--mono",
                            style: "color: var(--icon-weak-base)",
                            mono: true
                          });
                        }
                      }), createComponent(Match, {
                        get when() {
                          return active();
                        },
                        get children() {
                          return createComponent(FileIcon, {
                            node: node,
                            "class": "size-4 filetree-icon filetree-icon--mono",
                            get style() {
                              return kindTextColor(kind());
                            },
                            mono: true
                          });
                        }
                      }), createComponent(Match, {
                        get when() {
                          return !node.ignored;
                        },
                        get children() {
                          const pair = document.createElement("span");
                          pair.className = "filetree-iconpair size-4";
                          pair.appendChild(createComponent(FileIcon, {
                            node: node,
                            "class": "size-4 filetree-icon filetree-icon--color opacity-0 group-hover/filetree:opacity-100"
                          }));
                          pair.appendChild(createComponent(FileIcon, {
                            node: node,
                            "class": "size-4 filetree-icon filetree-icon--mono group-hover/filetree:opacity-0",
                            mono: true
                          }));
                          return pair;
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
  });
  createRenderEffect(() => {
    const out = [];
    appendResolved(out, rows);
    syncChildren(root, out);
  });
  createRenderEffect(() => {
    root.className = `d-flex flex-column gap-0.5 ${props.class ?? ""}`;
  });
  return root;
}
