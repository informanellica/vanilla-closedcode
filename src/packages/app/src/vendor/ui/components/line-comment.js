import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg><path d="M16.25 3.75H3.75V16.25L6.875 14.4643H16.25V3.75Z"stroke=currentColor stroke-linecap=square></svg>`, false, true, false),
  _tmpl$2 = /*#__PURE__*/_$template(`<svg data-slot=line-comment-icon viewBox="0 0 20 20"fill=none aria-hidden=true>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<svg><path d="M10 5.41699V10.0003M10 10.0003V14.5837M10 10.0003H5.4165M10 10.0003H14.5832"stroke=currentColor stroke-linecap=square></svg>`, false, true, false),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-slot=line-comment-popover data-inline-body>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-component=line-comment data-prevent-autofocus>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<button type=button data-slot=line-comment-button>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-slot=line-comment-popover>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div data-slot=line-comment-tools>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div data-slot=line-comment-content><div data-slot=line-comment-head><div data-slot=line-comment-text></div></div><div data-slot=line-comment-label>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div data-slot=line-comment-mention-list>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div data-slot=line-comment-editor><textarea data-slot=line-comment-textarea></textarea><div data-slot=line-comment-actions><div data-slot=line-comment-editor-label>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<span data-slot=line-comment-mention-file>`),
  _tmpl$11 = /*#__PURE__*/_$template(`<button type=button data-slot=line-comment-mention-item><div data-slot=line-comment-mention-path><span data-slot=line-comment-mention-dir>`),
  _tmpl$12 = /*#__PURE__*/_$template(`<button type=button data-slot=line-comment-action data-variant=ghost>`),
  _tmpl$13 = /*#__PURE__*/_$template(`<button type=button data-slot=line-comment-action data-variant=primary>`);
import { useFilteredList } from "../hooks/index.js";
import { getDirectory, getFilename } from "core/util/path";
import { createSignal, For, onMount, Show, splitProps } from "solid-js";
import { Button } from "./button.js";
import { FileIcon } from "./file-icon.js";
import { Icon } from "./icon.js";
import { installLineCommentStyles } from "./line-comment-styles.js";
import { useI18n } from "../context/i18n.js";
installLineCommentStyles();
function InlineGlyph(props) {
  return (() => {
    var _el$ = _tmpl$2();
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return props.icon === "comment";
      },
      get fallback() {
        return _tmpl$3();
      },
      get children() {
        return _tmpl$();
      }
    }));
    return _el$;
  })();
}
export const LineCommentAnchor = props => {
  const hidden = () => !props.inline && props.top === undefined;
  const variant = () => props.variant ?? "default";
  const icon = () => props.icon ?? "comment";
  const inlineBody = () => props.inline && props.hideButton;
  return (() => {
    var _el$4 = _tmpl$5();
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return inlineBody();
      },
      get fallback() {
        return [(() => {
          var _el$6 = _tmpl$6();
          _$addEventListener(_el$6, "mouseenter", props.onMouseEnter);
          _$addEventListener(_el$6, "click", props.onClick);
          _$addEventListener(_el$6, "mouseup", e => e.stopPropagation());
          _$addEventListener(_el$6, "mousedown", e => e.stopPropagation());
          _$insert(_el$6, _$createComponent(Show, {
            get when() {
              return props.inline;
            },
            get fallback() {
              return _$createComponent(Icon, {
                get name() {
                  return icon() === "plus" ? "plus-small" : "comment";
                },
                size: "small"
              });
            },
            get children() {
              return _$createComponent(InlineGlyph, {
                get icon() {
                  return icon();
                }
              });
            }
          }));
          _$effect(() => _$setAttribute(_el$6, "aria-label", props.buttonLabel));
          return _el$6;
        })(), _$createComponent(Show, {
          get when() {
            return props.open;
          },
          get children() {
            var _el$7 = _tmpl$7();
            _$addEventListener(_el$7, "focusout", props.onPopoverFocusOut);
            _$addEventListener(_el$7, "mousedown", e => e.stopPropagation());
            _$insert(_el$7, () => props.children);
            _$effect(_$p => _$classList(_el$7, {
              [props.popoverClass ?? ""]: !!props.popoverClass
            }, _$p));
            return _el$7;
          }
        })];
      },
      get children() {
        var _el$5 = _tmpl$4();
        _$addEventListener(_el$5, "focusout", props.onPopoverFocusOut);
        _$addEventListener(_el$5, "mouseenter", props.onMouseEnter);
        _$addEventListener(_el$5, "click", props.onClick);
        _$addEventListener(_el$5, "mousedown", e => e.stopPropagation());
        _$insert(_el$5, () => props.children);
        _$effect(_$p => _$classList(_el$5, {
          [props.popoverClass ?? ""]: !!props.popoverClass
        }, _$p));
        return _el$5;
      }
    }));
    _$effect(_p$ => {
      var _v$ = variant(),
        _v$2 = props.id,
        _v$3 = props.open ? "" : undefined,
        _v$4 = props.inline ? "" : undefined,
        _v$5 = {
          [props.class ?? ""]: !!props.class
        },
        _v$6 = props.inline ? undefined : {
          top: `${props.top ?? 0}px`,
          opacity: hidden() ? 0 : 1,
          "pointer-events": hidden() ? "none" : "auto"
        };
      _v$ !== _p$.e && _$setAttribute(_el$4, "data-variant", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$4, "data-comment-id", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$4, "data-open", _p$.a = _v$3);
      _v$4 !== _p$.o && _$setAttribute(_el$4, "data-inline", _p$.o = _v$4);
      _p$.i = _$classList(_el$4, _v$5, _p$.i);
      _p$.n = _$style(_el$4, _v$6, _p$.n);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$4;
  })();
};
export const LineComment = props => {
  const i18n = useI18n();
  const [split, rest] = splitProps(props, ["comment", "selection", "actions"]);
  return _$createComponent(LineCommentAnchor, _$mergeProps(rest, {
    variant: "default",
    get hideButton() {
      return props.inline;
    },
    get children() {
      var _el$8 = _tmpl$9(),
        _el$9 = _el$8.firstChild,
        _el$0 = _el$9.firstChild,
        _el$10 = _el$9.nextSibling;
      _$insert(_el$0, () => split.comment);
      _$insert(_el$9, _$createComponent(Show, {
        get when() {
          return split.actions;
        },
        get children() {
          var _el$1 = _tmpl$8();
          _$insert(_el$1, () => split.actions);
          return _el$1;
        }
      }), null);
      _$insert(_el$10, () => i18n.t("ui.lineComment.label.prefix"), null);
      _$insert(_el$10, () => split.selection, null);
      _$insert(_el$10, () => i18n.t("ui.lineComment.label.suffix"), null);
      return _el$8;
    }
  }));
};
export const LineCommentAdd = props => {
  const [split, rest] = splitProps(props, ["label"]);
  const i18n = useI18n();
  return _$createComponent(LineCommentAnchor, _$mergeProps(rest, {
    open: false,
    variant: "add",
    icon: "plus",
    get buttonLabel() {
      return split.label ?? i18n.t("ui.lineComment.submit");
    }
  }));
};
export const LineCommentEditor = props => {
  const i18n = useI18n();
  const [split, rest] = splitProps(props, ["value", "selection", "onInput", "onCancel", "onSubmit", "placeholder", "rows", "autofocus", "cancelLabel", "submitLabel", "mention"]);
  const refs = {
    textarea: undefined
  };
  const [open, setOpen] = createSignal(false);
  function selectMention(item) {
    if (!item) return;
    const textarea = refs.textarea;
    const query = currentMention();
    if (!textarea || !query) return;
    const value = `${textarea.value.slice(0, query.start)}@${item.path} ${textarea.value.slice(query.end)}`;
    const cursor = query.start + item.path.length + 2;
    split.onInput(value);
    closeMention();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }
  const mention = useFilteredList({
    items: async query => {
      if (!split.mention) return [];
      if (!query.trim()) return [];
      const paths = await split.mention.items(query);
      return paths.map(path => ({
        path
      }));
    },
    key: item => item.path,
    filterKeys: ["path"],
    onSelect: selectMention
  });
  const focus = () => refs.textarea?.focus();
  const hold = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  const click = fn => e => {
    e.stopPropagation();
    fn();
  };
  const closeMention = () => {
    setOpen(false);
    mention.clear();
  };
  const currentMention = () => {
    const textarea = refs.textarea;
    if (!textarea) return;
    if (!split.mention) return;
    if (textarea.selectionStart !== textarea.selectionEnd) return;
    const end = textarea.selectionStart;
    const match = textarea.value.slice(0, end).match(/@(\S*)$/);
    if (!match) return;
    return {
      query: match[1] ?? "",
      start: end - match[0].length,
      end
    };
  };
  const syncMention = () => {
    const item = currentMention();
    if (!item) {
      closeMention();
      return;
    }
    setOpen(true);
    mention.onInput(item.query);
  };
  const selectActiveMention = () => {
    const items = mention.flat();
    if (items.length === 0) return;
    const active = mention.active();
    selectMention(items.find(item => item.path === active) ?? items[0]);
  };
  const submit = () => {
    const value = split.value.trim();
    if (!value) return;
    split.onSubmit(value);
  };
  onMount(() => {
    if (split.autofocus === false) return;
    requestAnimationFrame(focus);
  });
  return _$createComponent(LineCommentAnchor, _$mergeProps(rest, {
    open: true,
    variant: "editor",
    get hideButton() {
      return props.inline;
    },
    onClick: () => focus(),
    get children() {
      var _el$11 = _tmpl$1(),
        _el$12 = _el$11.firstChild,
        _el$14 = _el$12.nextSibling,
        _el$15 = _el$14.firstChild;
      _$addEventListener(_el$12, "keydown", e => {
        const event = e;
        if (event.isComposing || event.keyCode === 229) return;
        event.stopPropagation();
        if (open()) {
          if (e.key === "Escape") {
            event.preventDefault();
            closeMention();
            return;
          }
          if (e.key === "Tab") {
            if (mention.flat().length === 0) return;
            event.preventDefault();
            selectActiveMention();
            return;
          }
          const nav = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter";
          const ctrlNav = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (e.key === "n" || e.key === "p");
          if ((nav || ctrlNav) && mention.flat().length > 0) {
            mention.onKeyDown(event);
            event.preventDefault();
            return;
          }
        }
        if (e.key === "Escape") {
          event.preventDefault();
          e.currentTarget.blur();
          split.onCancel();
          return;
        }
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;
        event.preventDefault();
        submit();
      });
      _$addEventListener(_el$12, "select", () => syncMention());
      _$addEventListener(_el$12, "click", () => syncMention());
      _$addEventListener(_el$12, "input", e => {
        const value = e.currentTarget.value;
        split.onInput(value);
        syncMention();
      });
      _$use(el => {
        refs.textarea = el;
      }, _el$12);
      _$insert(_el$11, _$createComponent(Show, {
        get when() {
          return _$memo(() => !!open())() && mention.flat().length > 0;
        },
        get children() {
          var _el$13 = _tmpl$0();
          _$insert(_el$13, _$createComponent(For, {
            get each() {
              return mention.flat().slice(0, 10);
            },
            children: item => {
              const directory = item.path.endsWith("/") ? item.path : getDirectory(item.path);
              const name = item.path.endsWith("/") ? "" : getFilename(item.path);
              return (() => {
                var _el$16 = _tmpl$11(),
                  _el$17 = _el$16.firstChild,
                  _el$18 = _el$17.firstChild;
                _el$16.$$click = () => selectMention(item);
                _el$16.addEventListener("mouseenter", () => mention.setActive(item.path));
                _el$16.$$mousedown = event => event.preventDefault();
                _$insert(_el$16, _$createComponent(FileIcon, {
                  get node() {
                    return {
                      path: item.path,
                      type: "file"
                    };
                  },
                  "class": "shrink-0 size-4"
                }), _el$17);
                _$insert(_el$18, directory);
                _$insert(_el$17, _$createComponent(Show, {
                  when: name,
                  get children() {
                    var _el$19 = _tmpl$10();
                    _$insert(_el$19, name);
                    return _el$19;
                  }
                }), null);
                _$effect(() => _$setAttribute(_el$16, "data-active", mention.active() === item.path ? "" : undefined));
                return _el$16;
              })();
            }
          }));
          return _el$13;
        }
      }), _el$14);
      _$insert(_el$15, () => i18n.t("ui.lineComment.editorLabel.prefix"), null);
      _$insert(_el$15, () => split.selection, null);
      _$insert(_el$15, () => i18n.t("ui.lineComment.editorLabel.suffix"), null);
      _$insert(_el$14, _$createComponent(Show, {
        get when() {
          return !props.inline;
        },
        get fallback() {
          return [(() => {
            var _el$20 = _tmpl$12();
            _$addEventListener(_el$20, "click", click(split.onCancel));
            _$addEventListener(_el$20, "mousedown", hold);
            _$insert(_el$20, () => split.cancelLabel ?? i18n.t("ui.common.cancel"));
            return _el$20;
          })(), (() => {
            var _el$21 = _tmpl$13();
            _$addEventListener(_el$21, "click", click(submit));
            _$addEventListener(_el$21, "mousedown", hold);
            _$insert(_el$21, () => split.submitLabel ?? i18n.t("ui.lineComment.submit"));
            _$effect(() => _el$21.disabled = split.value.trim().length === 0);
            return _el$21;
          })()];
        },
        get children() {
          return [_$createComponent(Button, {
            size: "small",
            variant: "ghost",
            get onClick() {
              return split.onCancel;
            },
            get children() {
              return split.cancelLabel ?? i18n.t("ui.common.cancel");
            }
          }), _$createComponent(Button, {
            size: "small",
            variant: "primary",
            get disabled() {
              return split.value.trim().length === 0;
            },
            onClick: submit,
            get children() {
              return split.submitLabel ?? i18n.t("ui.lineComment.submit");
            }
          })];
        }
      }), null);
      _$effect(_p$ => {
        var _v$7 = split.rows ?? 3,
          _v$8 = split.placeholder ?? i18n.t("ui.lineComment.placeholder");
        _v$7 !== _p$.e && _$setAttribute(_el$12, "rows", _p$.e = _v$7);
        _v$8 !== _p$.t && _$setAttribute(_el$12, "placeholder", _p$.t = _v$8);
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      _$effect(() => _el$12.value = split.value);
      return _el$11;
    }
  }));
};
_$delegateEvents(["mousedown", "click"]);