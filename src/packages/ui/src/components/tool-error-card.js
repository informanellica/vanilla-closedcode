import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<a data-slot=basic-tool-tool-subtitle class="clickable subagent-link">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-component=tool-trigger><div data-slot=basic-tool-tool-trigger-content><span data-slot=basic-tool-tool-indicator data-component=tool-error-card-icon></span><div data-slot=basic-tool-tool-info><div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=tool-error-card-copy>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-slot=tool-error-card-content>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-subtitle>`);
import { createMemo, Show, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { Card, CardDescription } from "./card.js";
import { Collapsible } from "./collapsible.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { Tooltip } from "./tooltip.js";
import { useI18n } from "../context/i18n.js";
export function ToolErrorCard(props) {
  const i18n = useI18n();
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    copied: false
  });
  const open = () => state.open;
  const copied = () => state.copied;
  const [split, rest] = splitProps(props, ["tool", "error", "defaultOpen", "subtitle", "href"]);
  const name = createMemo(() => {
    const map = {
      read: "ui.tool.read",
      list: "ui.tool.list",
      glob: "ui.tool.glob",
      grep: "ui.tool.grep",
      task: "ui.tool.task",
      webfetch: "ui.tool.webfetch",
      websearch: "ui.tool.websearch",
      bash: "ui.tool.shell",
      apply_patch: "ui.tool.patch",
      question: "ui.tool.questions"
    };
    const key = map[split.tool];
    if (!key) return split.tool;
    if (!key.includes(".")) return key;
    return i18n.t(key);
  });
  const cleaned = createMemo(() => split.error.replace(/^Error:\s*/, "").trim());
  const tail = createMemo(() => {
    const value = cleaned();
    const prefix = `${split.tool} `;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    return value;
  });
  const subtitle = createMemo(() => {
    if (split.subtitle) return split.subtitle;
    const parts = tail().split(": ");
    if (parts.length <= 1) return i18n.t("ui.toolErrorCard.failed");
    const head = (parts[0] ?? "").trim();
    if (!head) return i18n.t("ui.toolErrorCard.failed");
    return head[0] ? head[0].toUpperCase() + head.slice(1) : i18n.t("ui.toolErrorCard.failed");
  });
  const body = createMemo(() => {
    const parts = tail().split(": ");
    if (parts.length <= 1) return cleaned();
    return parts.slice(1).join(": ").trim() || cleaned();
  });
  const copy = async () => {
    const text = cleaned();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };
  return _$createComponent(Card, _$mergeProps(rest, {
    "data-kind": "tool-error-card",
    get ["data-open"]() {
      return open() ? "true" : "false";
    },
    variant: "error",
    get children() {
      return _$createComponent(Collapsible, {
        "class": "tool-collapsible",
        get ["data-open"]() {
          return open() ? "true" : "false";
        },
        get open() {
          return open();
        },
        onOpenChange: value => setState("open", value),
        get children() {
          return [_$createComponent(Collapsible.Trigger, {
            get children() {
              var _el$ = _tmpl$2(),
                _el$2 = _el$.firstChild,
                _el$3 = _el$2.firstChild,
                _el$4 = _el$3.nextSibling,
                _el$5 = _el$4.firstChild,
                _el$6 = _el$5.firstChild,
                _el$7 = _el$6.firstChild;
              _$insert(_el$3, _$createComponent(Icon, {
                name: "circle-ban-sign",
                size: "small",
                style: {
                  "stroke-width": 1.5
                }
              }));
              _$insert(_el$7, name);
              _$insert(_el$6, _$createComponent(Show, {
                get when() {
                  return _$memo(() => !!split.href)() && split.subtitle;
                },
                get fallback() {
                  return (() => {
                    var _el$1 = _tmpl$5();
                    _$insert(_el$1, subtitle);
                    return _el$1;
                  })();
                },
                get children() {
                  var _el$8 = _tmpl$();
                  _el$8.$$click = e => e.stopPropagation();
                  _$insert(_el$8, subtitle);
                  _$effect(() => _$setAttribute(_el$8, "href", split.href));
                  return _el$8;
                }
              }), null);
              _$insert(_el$, _$createComponent(Collapsible.Arrow, {}), null);
              return _el$;
            }
          }), _$createComponent(Collapsible.Content, {
            get children() {
              var _el$9 = _tmpl$4();
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return open();
                },
                get children() {
                  var _el$0 = _tmpl$3();
                  _$insert(_el$0, _$createComponent(Tooltip, {
                    get value() {
                      return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.toolErrorCard.copyError");
                    },
                    placement: "top",
                    gutter: 4,
                    get children() {
                      return _$createComponent(IconButton, {
                        get icon() {
                          return copied() ? "check" : "copy";
                        },
                        size: "normal",
                        variant: "ghost",
                        onMouseDown: e => e.preventDefault(),
                        onClick: e => {
                          e.stopPropagation();
                          void copy();
                        },
                        get ["aria-label"]() {
                          return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.toolErrorCard.copyError");
                        }
                      });
                    }
                  }));
                  return _el$0;
                }
              }), null);
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return body();
                },
                children: value => _$createComponent(CardDescription, {
                  get children() {
                    return value();
                  }
                })
              }), null);
              return _el$9;
            }
          })];
        }
      });
    }
  }));
}
_$delegateEvents(["click"]);