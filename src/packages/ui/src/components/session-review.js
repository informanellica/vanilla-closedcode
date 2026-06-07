import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class=pb-6>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=session-review-container>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-component=session-review><div data-slot=session-review-header><div data-slot=session-review-title></div><div data-slot=session-review-actions>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span data-slot=session-review-directory>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<button data-slot=session-review-view-button type=button>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-slot=session-review-change-group data-type=added><span data-slot=session-review-change data-type=added>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span data-slot=session-review-change data-type=removed>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<span data-slot=session-review-change data-type=modified>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<span data-slot=session-review-diff-chevron>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div data-slot=session-review-trigger-content><div data-slot=session-review-file-info><div data-slot=session-review-file-name-container><span data-slot=session-review-filename></span></div></div><div data-slot=session-review-trigger-actions>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div data-slot=session-review-diff-placeholder class="rounded-lg border border-border-weak-base bg-background-stronger/40"style=height:160px>`),
  _tmpl$11 = /*#__PURE__*/_$template(`<div data-slot=session-review-large-diff><div data-slot=session-review-large-diff-title></div><div data-slot=session-review-large-diff-meta></div><div data-slot=session-review-large-diff-actions>`),
  _tmpl$12 = /*#__PURE__*/_$template(`<div data-slot=session-review-diff-wrapper>`);
import { Accordion } from "./accordion.js";
import { Button } from "./button.js";
import { DropdownMenu } from "./dropdown-menu.js";
import { RadioGroup } from "./radio-group.js";
import { DiffChanges } from "./diff-changes.js";
import { FileIcon } from "./file-icon.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { StickyAccordionHeader } from "./sticky-accordion-header.js";
import { Tooltip } from "./tooltip.js";
import { ScrollView } from "./scroll-view.js";
import { useFileComponent } from "../context/file.js";
import { useI18n } from "../context/i18n.js";
import { getDirectory, getFilename } from "core/util/path";
import { checksum } from "core/util/encode";
import { createEffect, createMemo, For, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import { mediaKindFromPath } from "../pierre/media.js";
import { cloneSelectedLineRange, previewSelectedLines } from "../pierre/selection-bridge.js";
import { createLineCommentController } from "./line-comment-annotations.js";
import { normalize, text } from "./session-diff.js";
const MAX_DIFF_CHANGED_LINES = 500;
const REVIEW_MOUNT_MARGIN = 300;
function diff(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("file" in value) || typeof value.file !== "string") return false;
  if (!("additions" in value) || typeof value.additions !== "number") return false;
  if (!("deletions" in value) || typeof value.deletions !== "number") return false;
  if ("patch" in value && value.patch !== undefined && typeof value.patch !== "string") return false;
  if ("before" in value && value.before !== undefined && typeof value.before !== "string") return false;
  if ("after" in value && value.after !== undefined && typeof value.after !== "string") return false;
  if (!("status" in value) || value.status === undefined) return true;
  return value.status === "added" || value.status === "deleted" || value.status === "modified";
}
function list(value) {
  if (Array.isArray(value) && value.every(diff)) return value;
  if (Array.isArray(value)) return value.filter(diff);
  if (diff(value)) return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter(diff);
}
function ReviewCommentMenu(props) {
  return (() => {
    var _el$ = _tmpl$();
    _el$.$$click = event => event.stopPropagation();
    _el$.$$mousedown = event => event.stopPropagation();
    _$insert(_el$, _$createComponent(DropdownMenu, {
      gutter: 4,
      placement: "bottom-end",
      get children() {
        return [_$createComponent(DropdownMenu.Trigger, {
          as: IconButton,
          icon: "dot-grid",
          variant: "ghost",
          size: "small",
          "class": "size-6 rounded-md",
          get ["aria-label"]() {
            return props.labels.moreLabel;
          }
        }), _$createComponent(DropdownMenu.Portal, {
          get children() {
            return _$createComponent(DropdownMenu.Content, {
              get children() {
                return [_$createComponent(DropdownMenu.Item, {
                  get onSelect() {
                    return props.onEdit;
                  },
                  get children() {
                    return _$createComponent(DropdownMenu.ItemLabel, {
                      get children() {
                        return props.labels.editLabel;
                      }
                    });
                  }
                }), _$createComponent(DropdownMenu.Item, {
                  get onSelect() {
                    return props.onDelete;
                  },
                  get children() {
                    return _$createComponent(DropdownMenu.ItemLabel, {
                      get children() {
                        return props.labels.deleteLabel;
                      }
                    });
                  }
                })];
              }
            });
          }
        })];
      }
    }));
    return _el$;
  })();
}
function diffId(file) {
  const sum = checksum(file);
  if (!sum) return;
  return `session-review-diff-${sum}`;
}
export const SessionReview = props => {
  let scroll;
  let focusToken = 0;
  let frame;
  const i18n = useI18n();
  const fileComponent = useFileComponent();
  const anchors = new Map();
  const nodes = new Map();
  const [store, setStore] = createStore({
    open: [],
    visible: {},
    force: {},
    selection: null,
    commenting: null,
    opened: null
  });
  const selection = () => store.selection;
  const commenting = () => store.commenting;
  const opened = () => store.opened;
  const open = () => props.open ?? store.open;
  const items = createMemo(() => list(props.diffs).map(diff => ({
    ...normalize(diff),
    preloaded: diff.preloaded
  })));
  const files = createMemo(() => items().map(diff => diff.file));
  const grouped = createMemo(() => {
    const next = new Map();
    for (const comment of props.comments ?? []) {
      const list = next.get(comment.file);
      if (list) {
        list.push(comment);
        continue;
      }
      next.set(comment.file, [comment]);
    }
    return next;
  });
  const diffStyle = () => props.diffStyle ?? (props.split ? "split" : "unified");
  const hasDiffs = () => files().length > 0;
  const syncVisible = () => {
    frame = undefined;
    if (!scroll) return;
    const root = scroll.getBoundingClientRect();
    const top = root.top - REVIEW_MOUNT_MARGIN;
    const bottom = root.bottom + REVIEW_MOUNT_MARGIN;
    const openSet = new Set(open());
    const next = {};
    for (const [file, el] of nodes) {
      if (!openSet.has(file)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < top || rect.top > bottom) continue;
      next[file] = true;
    }
    const prev = untrack(() => store.visible);
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length === nextKeys.length && nextKeys.every(file => prev[file])) return;
    setStore("visible", next);
  };
  const queue = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(syncVisible);
  };
  const pinned = file => props.focusedComment?.file === file || props.focusedFile === file || selection()?.file === file || commenting()?.file === file || opened()?.file === file;
  const handleScroll = event => {
    queue();
    const next = props.onScroll;
    if (!next) return;
    if (Array.isArray(next)) {
      const [fn, data] = next;
      fn(data, event);
      return;
    }
    ;
    next(event);
  };
  onCleanup(() => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
  });
  createEffect(() => {
    props.open;
    files();
    queue();
  });
  const handleChange = next => {
    props.onOpenChange?.(next);
    if (props.open === undefined) setStore("open", next);
    queue();
  };
  const handleExpandOrCollapseAll = () => {
    const next = open().length > 0 ? [] : files();
    handleChange(next);
  };
  const openFileLabel = () => i18n.t("ui.sessionReview.openFile");
  const selectionSide = range => range.endSide ?? range.side ?? "additions";
  const selectionPreview = (diff, range) => {
    const side = selectionSide(range);
    const contents = text(diff, side);
    if (contents.length === 0) return undefined;
    return previewSelectedLines(contents, range);
  };
  createEffect(() => {
    const focus = props.focusedComment;
    if (!focus) return;
    untrack(() => {
      focusToken++;
      const token = focusToken;
      setStore("opened", focus);
      const comment = (props.comments ?? []).find(c => c.file === focus.file && c.id === focus.id);
      if (comment) setStore("selection", {
        file: comment.file,
        range: cloneSelectedLineRange(comment.selection)
      });
      const current = open();
      if (!current.includes(focus.file)) {
        handleChange([...current, focus.file]);
      }
      const scrollTo = attempt => {
        if (token !== focusToken) return;
        const root = scroll;
        if (!root) return;
        const wrapper = anchors.get(focus.file);
        const anchor = wrapper?.querySelector(`[data-comment-id="${focus.id}"]`);
        const ready = anchor instanceof HTMLElement && anchor.style.pointerEvents !== "none" && anchor.style.opacity !== "0";
        const target = ready ? anchor : wrapper;
        if (!target) {
          if (attempt >= 120) return;
          requestAnimationFrame(() => scrollTo(attempt + 1));
          return;
        }
        const rootRect = root.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset = targetRect.top - rootRect.top;
        const next = root.scrollTop + offset - rootRect.height / 2 + targetRect.height / 2;
        root.scrollTop = Math.max(0, next);
        if (ready) return;
        if (attempt >= 120) return;
        requestAnimationFrame(() => scrollTo(attempt + 1));
      };
      requestAnimationFrame(() => scrollTo(0));
      requestAnimationFrame(() => props.onFocusedCommentChange?.(null));
    });
  });
  return (() => {
    var _el$2 = _tmpl$4(),
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling;
    _$insert(_el$4, (() => {
      var _c$ = _$memo(() => props.title === undefined);
      return () => _c$() ? i18n.t("ui.sessionReview.title") : props.title;
    })());
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!hasDiffs())() && props.onDiffStyleChange;
      },
      get children() {
        return _$createComponent(RadioGroup, {
          options: ["unified", "split"],
          get current() {
            return diffStyle();
          },
          size: "small",
          value: style => style,
          label: style => i18n.t(style === "unified" ? "ui.sessionReview.diffStyle.unified" : "ui.sessionReview.diffStyle.split"),
          onSelect: style => style && props.onDiffStyleChange?.(style)
        });
      }
    }), null);
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return hasDiffs();
      },
      get children() {
        return _$createComponent(Button, {
          size: "small",
          icon: "chevron-grabber-vertical",
          "class": "w-[106px] justify-start",
          onClick: handleExpandOrCollapseAll,
          get children() {
            return _$createComponent(Switch, {
              get children() {
                return [_$createComponent(Match, {
                  get when() {
                    return open().length > 0;
                  },
                  get children() {
                    return i18n.t("ui.sessionReview.collapseAll");
                  }
                }), _$createComponent(Match, {
                  when: true,
                  get children() {
                    return i18n.t("ui.sessionReview.expandAll");
                  }
                })];
              }
            });
          }
        });
      }
    }), null);
    _$insert(_el$5, () => props.actions, null);
    _$insert(_el$2, _$createComponent(ScrollView, {
      "data-slot": "session-review-scroll",
      viewportRef: el => {
        scroll = el;
        props.scrollRef?.(el);
        queue();
      },
      onScroll: handleScroll,
      get classList() {
        return {
          [props.classes?.root ?? ""]: !!props.classes?.root
        };
      },
      get children() {
        var _el$6 = _tmpl$3();
        _$insert(_el$6, _$createComponent(Show, {
          get when() {
            return hasDiffs();
          },
          get fallback() {
            return props.empty;
          },
          get children() {
            var _el$7 = _tmpl$2();
            _$insert(_el$7, _$createComponent(Accordion, {
              multiple: true,
              get value() {
                return open();
              },
              onChange: handleChange,
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return items();
                  },
                  children: diff => {
                    const file = diff.file;

                    // binary files have empty diffs that we can't render
                    const diffCanRender = () => diff.additions !== 0 || diff.deletions !== 0;
                    const expanded = createMemo(() => open().includes(file));
                    const mounted = createMemo(() => expanded() && (!!store.visible[file] || pinned(file)));
                    const force = () => !!store.force[file];
                    const comments = createMemo(() => grouped().get(file) ?? []);
                    const commentedLines = createMemo(() => comments().map(c => c.selection));
                    const beforeText = () => text(diff, "deletions");
                    const afterText = () => text(diff, "additions");
                    const changedLines = () => diff.additions + diff.deletions;
                    const mediaKind = createMemo(() => mediaKindFromPath(file));
                    const tooLarge = createMemo(() => {
                      if (!expanded()) return false;
                      if (force()) return false;
                      if (mediaKind()) return false;
                      return changedLines() > MAX_DIFF_CHANGED_LINES;
                    });
                    const isAdded = () => diff.status === "added" || beforeText().length === 0 && afterText().length > 0;
                    const isDeleted = () => diff.status === "deleted" || afterText().length === 0 && beforeText().length > 0;
                    const selectedLines = createMemo(() => {
                      const current = selection();
                      if (!current || current.file !== file) return null;
                      return current.range;
                    });
                    const draftRange = createMemo(() => {
                      const current = commenting();
                      if (!current || current.file !== file) return null;
                      return current.range;
                    });
                    const commentsUi = createLineCommentController({
                      comments,
                      label: i18n.t("ui.lineComment.submit"),
                      draftKey: () => file,
                      mention: props.lineCommentMention,
                      state: {
                        opened: () => {
                          const current = opened();
                          if (!current || current.file !== file) return null;
                          return current.id;
                        },
                        setOpened: id => setStore("opened", id ? {
                          file,
                          id
                        } : null),
                        selected: selectedLines,
                        setSelected: range => setStore("selection", range ? {
                          file,
                          range
                        } : null),
                        commenting: draftRange,
                        setCommenting: range => setStore("commenting", range ? {
                          file,
                          range
                        } : null)
                      },
                      getSide: selectionSide,
                      clearSelectionOnSelectionEndNull: false,
                      onSubmit: ({
                        comment,
                        selection
                      }) => {
                        props.onLineComment?.({
                          file,
                          selection,
                          comment,
                          preview: selectionPreview(diff, selection)
                        });
                      },
                      onUpdate: ({
                        id,
                        comment,
                        selection
                      }) => {
                        props.onLineCommentUpdate?.({
                          id,
                          file,
                          selection,
                          comment,
                          preview: selectionPreview(diff, selection)
                        });
                      },
                      onDelete: comment => {
                        props.onLineCommentDelete?.({
                          id: comment.id,
                          file
                        });
                      },
                      editSubmitLabel: props.lineCommentActions?.saveLabel,
                      renderCommentActions: props.lineCommentActions ? (comment, controls) => _$createComponent(ReviewCommentMenu, {
                        get labels() {
                          return props.lineCommentActions;
                        },
                        get onEdit() {
                          return controls.edit;
                        },
                        get onDelete() {
                          return controls.remove;
                        }
                      }) : undefined
                    });
                    onCleanup(() => {
                      anchors.delete(file);
                      nodes.delete(file);
                      queue();
                    });
                    const handleLineSelected = range => {
                      if (!props.onLineComment) return;
                      commentsUi.onLineSelected(range);
                    };
                    const handleLineSelectionEnd = range => {
                      if (!props.onLineComment) return;
                      commentsUi.onLineSelectionEnd(range);
                    };
                    return _$createComponent(Accordion.Item, {
                      get value() {
                        return diffCanRender() ? file : null;
                      },
                      get id() {
                        return diffId(file);
                      },
                      "data-file": file,
                      "data-slot": "session-review-accordion-item",
                      get ["data-selected"]() {
                        return props.focusedFile === file ? "" : undefined;
                      },
                      get children() {
                        return [_$createComponent(StickyAccordionHeader, {
                          get children() {
                            return _$createComponent(Accordion.Trigger, {
                              get disabled() {
                                return !diffCanRender();
                              },
                              "class": "cursor-default",
                              get children() {
                                var _el$8 = _tmpl$1(),
                                  _el$9 = _el$8.firstChild,
                                  _el$0 = _el$9.firstChild,
                                  _el$10 = _el$0.firstChild,
                                  _el$12 = _el$9.nextSibling;
                                _$insert(_el$9, _$createComponent(FileIcon, {
                                  node: {
                                    path: file,
                                    type: "file"
                                  }
                                }), _el$0);
                                _$insert(_el$0, _$createComponent(Show, {
                                  get when() {
                                    return file.includes("/");
                                  },
                                  get children() {
                                    var _el$1 = _tmpl$5();
                                    _$insert(_el$1, () => `\u202A${getDirectory(file)}\u202C`);
                                    return _el$1;
                                  }
                                }), _el$10);
                                _$insert(_el$10, () => getFilename(file));
                                _$insert(_el$0, _$createComponent(Show, {
                                  get when() {
                                    return _$memo(() => !!props.onViewFile)() && diffCanRender();
                                  },
                                  get children() {
                                    return _$createComponent(Tooltip, {
                                      get value() {
                                        return openFileLabel();
                                      },
                                      placement: "top",
                                      gutter: 4,
                                      get children() {
                                        var _el$11 = _tmpl$6();
                                        _el$11.$$click = e => {
                                          e.stopPropagation();
                                          props.onViewFile?.(file);
                                        };
                                        _$insert(_el$11, _$createComponent(Icon, {
                                          name: "open-file",
                                          size: "small"
                                        }));
                                        _$effect(() => _$setAttribute(_el$11, "aria-label", openFileLabel()));
                                        return _el$11;
                                      }
                                    });
                                  }
                                }), null);
                                _$insert(_el$12, _$createComponent(Switch, {
                                  get children() {
                                    return [_$createComponent(Match, {
                                      get when() {
                                        return isAdded();
                                      },
                                      get children() {
                                        var _el$13 = _tmpl$7(),
                                          _el$14 = _el$13.firstChild;
                                        _$insert(_el$14, () => i18n.t("ui.sessionReview.change.added"));
                                        _$insert(_el$13, _$createComponent(DiffChanges, {
                                          changes: diff
                                        }), null);
                                        return _el$13;
                                      }
                                    }), _$createComponent(Match, {
                                      get when() {
                                        return isDeleted();
                                      },
                                      get children() {
                                        var _el$15 = _tmpl$8();
                                        _$insert(_el$15, () => i18n.t("ui.sessionReview.change.removed"));
                                        return _el$15;
                                      }
                                    }), _$createComponent(Match, {
                                      get when() {
                                        return !!mediaKind();
                                      },
                                      get children() {
                                        var _el$16 = _tmpl$9();
                                        _$insert(_el$16, () => i18n.t("ui.sessionReview.change.modified"));
                                        return _el$16;
                                      }
                                    }), _$createComponent(Match, {
                                      when: true,
                                      get children() {
                                        return _$createComponent(DiffChanges, {
                                          changes: diff
                                        });
                                      }
                                    })];
                                  }
                                }), null);
                                _$insert(_el$12, _$createComponent(Show, {
                                  get when() {
                                    return diffCanRender();
                                  },
                                  get children() {
                                    var _el$17 = _tmpl$0();
                                    _$insert(_el$17, _$createComponent(Icon, {
                                      name: "chevron-down",
                                      size: "small"
                                    }));
                                    return _el$17;
                                  }
                                }), null);
                                return _el$8;
                              }
                            });
                          }
                        }), _$createComponent(Accordion.Content, {
                          "data-slot": "session-review-accordion-content",
                          get children() {
                            var _el$18 = _tmpl$12();
                            _$use(el => {
                              anchors.set(file, el);
                              nodes.set(file, el);
                              queue();
                            }, _el$18);
                            _$insert(_el$18, _$createComponent(Show, {
                              get when() {
                                return expanded();
                              },
                              get children() {
                                return _$createComponent(Switch, {
                                  get children() {
                                    return [_$createComponent(Match, {
                                      get when() {
                                        return _$memo(() => !!!mounted())() && !tooLarge();
                                      },
                                      get children() {
                                        return _tmpl$10();
                                      }
                                    }), _$createComponent(Match, {
                                      get when() {
                                        return tooLarge();
                                      },
                                      get children() {
                                        var _el$20 = _tmpl$11(),
                                          _el$21 = _el$20.firstChild,
                                          _el$22 = _el$21.nextSibling,
                                          _el$23 = _el$22.nextSibling;
                                        _$insert(_el$21, () => i18n.t("ui.sessionReview.largeDiff.title"));
                                        _$insert(_el$22, () => i18n.t("ui.sessionReview.largeDiff.meta", {
                                          limit: MAX_DIFF_CHANGED_LINES.toLocaleString(),
                                          current: changedLines().toLocaleString()
                                        }));
                                        _$insert(_el$23, _$createComponent(Button, {
                                          size: "normal",
                                          variant: "secondary",
                                          onClick: () => setStore("force", file, true),
                                          get children() {
                                            return i18n.t("ui.sessionReview.largeDiff.renderAnyway");
                                          }
                                        }));
                                        return _el$20;
                                      }
                                    }), _$createComponent(Match, {
                                      when: true,
                                      get children() {
                                        return _$createComponent(Dynamic, {
                                          component: fileComponent,
                                          mode: "diff",
                                          get fileDiff() {
                                            return diff.fileDiff;
                                          },
                                          get preloadedDiff() {
                                            return diff.preloaded;
                                          },
                                          get diffStyle() {
                                            return diffStyle();
                                          },
                                          onRendered: () => {
                                            props.onDiffRendered?.();
                                          },
                                          get enableLineSelection() {
                                            return props.onLineComment != null;
                                          },
                                          get enableHoverUtility() {
                                            return props.onLineComment != null;
                                          },
                                          onLineSelected: handleLineSelected,
                                          onLineSelectionEnd: handleLineSelectionEnd,
                                          get onLineNumberSelectionEnd() {
                                            return commentsUi.onLineNumberSelectionEnd;
                                          },
                                          get annotations() {
                                            return commentsUi.annotations();
                                          },
                                          get renderAnnotation() {
                                            return commentsUi.renderAnnotation;
                                          },
                                          get renderHoverUtility() {
                                            return _$memo(() => !!props.onLineComment)() ? commentsUi.renderHoverUtility : undefined;
                                          },
                                          get selectedLines() {
                                            return selectedLines();
                                          },
                                          get commentedLines() {
                                            return commentedLines();
                                          },
                                          get media() {
                                            return {
                                              mode: "auto",
                                              path: file,
                                              deleted: diff.status === "deleted",
                                              readFile: diff.status === "deleted" ? undefined : props.readFile
                                            };
                                          }
                                        });
                                      }
                                    })];
                                  }
                                });
                              }
                            }));
                            return _el$18;
                          }
                        })];
                      }
                    });
                  }
                });
              }
            }));
            return _el$7;
          }
        }));
        _$effect(() => _$className(_el$6, props.classes?.container));
        return _el$6;
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = props.class,
        _v$2 = props.classList,
        _v$3 = props.classes?.header;
      _v$ !== _p$.e && _$className(_el$2, _p$.e = _v$);
      _p$.t = _$classList(_el$2, _v$2, _p$.t);
      _v$3 !== _p$.a && _$className(_el$3, _p$.a = _v$3);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$2;
  })();
};
_$delegateEvents(["mousedown", "click"]);