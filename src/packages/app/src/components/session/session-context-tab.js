import { template as _$template } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1"><div class="small fw-normal text-secondary"></div><div class="small fw-medium text-body-emphasis">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center justify-content-between gap-2 w-100"><div class="min-w-0 truncate"> <span class=text-body>• </span></div><div class="d-flex align-items-center gap-3"><div class="shrink-0 small fw-normal text-secondary">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class=p-3>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary"></div><div class="h-2 w-100 rounded-circle bg-body-tertiary overflow-hidden d-flex"></div><div class="d-flex flex-wrap gap-x-3 gap-y-1"></div><div class="d-none small fw-normal text-body-secondary">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="px-6 pt-4 pb-10 d-flex flex-column gap-10"><div class="grid grid-cols-1 @[32rem]:grid-cols-2 gap-4"></div><div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class=h-full>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1 small fw-normal text-secondary"><div class="size-2 rounded-1"></div><div></div><div class=text-body-secondary>%`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary"></div><div class="border rounded-2 bg-body-tertiary px-3 py-2">`);
import { createMemo, createEffect, on, onCleanup, For, Show } from "solid-js";
import { useSync } from "@/context/sync.js";
import { checksum } from "core/util/encode";
import { findLast } from "core/util/array";
import { same } from "@/utils/same.js";
import { Icon } from "@/bs/icon.js";
import { Accordion } from "@/vendor/ui/components/accordion.js";
import { StickyAccordionHeader } from "@/vendor/ui/components/sticky-accordion-header.js";
import { File } from "@/vendor/ui/components/file.js";
import { Markdown } from "@/vendor/ui/components/markdown.js";
import { ScrollView } from "@/vendor/ui/components/scroll-view.js";
import { useLanguage } from "@/context/language.js";
import { useProviders } from "@/hooks/use-providers.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { getSessionContextMetrics } from "./session-context-metrics.js";
import { estimateSessionContextBreakdown } from "./session-context-breakdown.js";
import { createSessionContextFormatter } from "./session-context-format.js";
const BREAKDOWN_COLOR = {
  system: "var(--syntax-info)",
  user: "var(--syntax-success)",
  assistant: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  other: "var(--syntax-comment)"
};
function Stat(props) {
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling;
    _$insert(_el$2, () => props.label);
    _$insert(_el$3, () => props.value);
    return _el$;
  })();
}
function RawMessageContent(props) {
  const file = createMemo(() => {
    const parts = props.getParts(props.message.id);
    const contents = JSON.stringify({
      message: props.message,
      parts
    }, null, 2);
    return {
      name: `${props.message.role}-${props.message.id}.json`,
      contents,
      cacheKey: checksum(contents)
    };
  });
  return _$createComponent(File, {
    mode: "text",
    get file() {
      return file();
    },
    overflow: "wrap",
    "class": "select-text",
    onRendered: () => requestAnimationFrame(props.onRendered)
  });
}
function RawMessage(props) {
  return _$createComponent(Accordion.Item, {
    get value() {
      return props.message.id;
    },
    get children() {
      return [_$createComponent(StickyAccordionHeader, {
        get children() {
          return _$createComponent(Accordion.Trigger, {
            get children() {
              var _el$4 = _tmpl$2(),
                _el$5 = _el$4.firstChild,
                _el$6 = _el$5.firstChild,
                _el$7 = _el$6.nextSibling,
                _el$8 = _el$7.firstChild,
                _el$9 = _el$5.nextSibling,
                _el$0 = _el$9.firstChild;
              _$insert(_el$5, () => props.message.role, _el$6);
              _$insert(_el$7, () => props.message.id, null);
              _$insert(_el$0, () => props.time(props.message.time.created));
              _$insert(_el$9, _$createComponent(Icon, {
                name: "chevron-grabber-vertical",
                size: "small",
                "class": "shrink-0 text-secondary"
              }), null);
              return _el$4;
            }
          });
        }
      }), _$createComponent(Accordion.Content, {
        "class": "bg-body",
        get children() {
          var _el$1 = _tmpl$3();
          _$insert(_el$1, _$createComponent(RawMessageContent, {
            get message() {
              return props.message;
            },
            get getParts() {
              return props.getParts;
            },
            get onRendered() {
              return props.onRendered;
            }
          }));
          return _el$1;
        }
      })];
    }
  });
}
const emptyMessages = [];
const emptyUserMessages = [];
export function SessionContextTab() {
  const sync = useSync();
  const language = useLanguage();
  const providers = useProviders();
  const {
    params,
    view
  } = useSessionLayout();
  const info = createMemo(() => params.id ? sync.session.get(params.id) : undefined);
  const messages = createMemo(() => {
    const id = params.id;
    if (!id) return emptyMessages;
    return sync.data?.message?.[id] ?? [];
  }, emptyMessages, {
    equals: same
  });
  const userMessages = createMemo(() => messages().filter(m => m.role === "user"), emptyUserMessages, {
    equals: same
  });
  const visibleUserMessages = createMemo(() => {
    const revert = info()?.revert?.messageID;
    if (!revert) return userMessages();
    return userMessages().filter(m => m.id < revert);
  }, emptyUserMessages, {
    equals: same
  });
  const usd = createMemo(() => new Intl.NumberFormat(language.intl(), {
    style: "currency",
    currency: "USD"
  }));
  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()));
  const ctx = createMemo(() => metrics().context);
  const formatter = createMemo(() => createSessionContextFormatter(language.intl()));
  const cost = createMemo(() => {
    return usd().format(metrics().totalCost);
  });
  const counts = createMemo(() => {
    const all = messages();
    const user = all.reduce((count, x) => count + (x.role === "user" ? 1 : 0), 0);
    const assistant = all.reduce((count, x) => count + (x.role === "assistant" ? 1 : 0), 0);
    return {
      all: all.length,
      user,
      assistant
    };
  });
  const systemPrompt = createMemo(() => {
    const msg = findLast(visibleUserMessages(), m => !!m.system);
    const system = msg?.system;
    if (!system) return;
    const trimmed = system.trim();
    if (!trimmed) return;
    return trimmed;
  });
  const providerLabel = createMemo(() => {
    const c = ctx();
    if (!c) return "—";
    return c.providerLabel;
  });
  const modelLabel = createMemo(() => {
    const c = ctx();
    if (!c) return "—";
    return c.modelLabel;
  });
  const breakdown = createMemo(on(() => [ctx()?.message.id, ctx()?.input, messages().length, systemPrompt()], () => {
    const c = ctx();
    if (!c?.input) return [];
    return estimateSessionContextBreakdown({
      messages: messages(),
      parts: sync.data?.part,
      input: c.input,
      systemPrompt: systemPrompt()
    });
  }));
  const breakdownLabel = key => {
    if (key === "system") return language.t("context.breakdown.system");
    if (key === "user") return language.t("context.breakdown.user");
    if (key === "assistant") return language.t("context.breakdown.assistant");
    if (key === "tool") return language.t("context.breakdown.tool");
    return language.t("context.breakdown.other");
  };
  const stats = [{
    label: "context.stats.session",
    value: () => info()?.title ?? params.id ?? "—"
  }, {
    label: "context.stats.messages",
    value: () => counts().all.toLocaleString(language.intl())
  }, {
    label: "context.stats.provider",
    value: providerLabel
  }, {
    label: "context.stats.model",
    value: modelLabel
  }, {
    label: "context.stats.limit",
    value: () => formatter().number(ctx()?.limit)
  }, {
    label: "context.stats.totalTokens",
    value: () => formatter().number(ctx()?.total)
  }, {
    label: "context.stats.usage",
    value: () => formatter().percent(ctx()?.usage)
  }, {
    label: "context.stats.inputTokens",
    value: () => formatter().number(ctx()?.input)
  }, {
    label: "context.stats.outputTokens",
    value: () => formatter().number(ctx()?.output)
  }, {
    label: "context.stats.reasoningTokens",
    value: () => formatter().number(ctx()?.reasoning)
  }, {
    label: "context.stats.cacheTokens",
    value: () => `${formatter().number(ctx()?.cacheRead)} / ${formatter().number(ctx()?.cacheWrite)}`
  }, {
    label: "context.stats.userMessages",
    value: () => counts().user.toLocaleString(language.intl())
  }, {
    label: "context.stats.assistantMessages",
    value: () => counts().assistant.toLocaleString(language.intl())
  }, {
    label: "context.stats.totalCost",
    value: cost
  }, {
    label: "context.stats.sessionCreated",
    value: () => formatter().time(info()?.time.created)
  }, {
    label: "context.stats.lastActivity",
    value: () => formatter().time(ctx()?.message.time.created)
  }];
  let scroll;
  let frame;
  let pending;
  const getParts = id => sync.data?.part?.[id] ?? [];
  const restoreScroll = () => {
    const el = scroll;
    if (!el) return;
    const s = view().scroll("context");
    if (!s) return;
    if (el.scrollTop !== s.y) el.scrollTop = s.y;
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x;
  };
  const handleScroll = event => {
    pending = {
      x: event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop
    };
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      const next = pending;
      pending = undefined;
      if (!next) return;
      view().setScroll("context", next);
    });
  };
  createEffect(on(() => messages().length, () => {
    requestAnimationFrame(restoreScroll);
  }, {
    defer: true
  }));
  onCleanup(() => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
  });
  return _$createComponent(ScrollView, {
    "class": "@container h-full",
    viewportRef: el => {
      scroll = el;
      restoreScroll();
    },
    onScroll: handleScroll,
    get children() {
      var _el$10 = _tmpl$5(),
        _el$11 = _el$10.firstChild,
        _el$17 = _el$11.nextSibling,
        _el$18 = _el$17.firstChild;
      _$insert(_el$11, _$createComponent(For, {
        each: stats,
        children: stat => _$createComponent(Stat, {
          get label() {
            return language.t(stat.label);
          },
          get value() {
            return stat.value();
          }
        })
      }));
      _$insert(_el$10, _$createComponent(Show, {
        get when() {
          return breakdown().length > 0;
        },
        get children() {
          var _el$12 = _tmpl$4(),
            _el$13 = _el$12.firstChild,
            _el$14 = _el$13.nextSibling,
            _el$15 = _el$14.nextSibling,
            _el$16 = _el$15.nextSibling;
          _$insert(_el$13, () => language.t("context.breakdown.title"));
          _$insert(_el$14, _$createComponent(For, {
            get each() {
              return breakdown();
            },
            children: segment => (() => {
              var _el$19 = _tmpl$6();
              _$effect(_p$ => {
                var _v$ = `${segment.width}%`,
                  _v$2 = BREAKDOWN_COLOR[segment.key];
                _v$ !== _p$.e && _$setStyleProperty(_el$19, "width", _p$.e = _v$);
                _v$2 !== _p$.t && _$setStyleProperty(_el$19, "background-color", _p$.t = _v$2);
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$19;
            })()
          }));
          _$insert(_el$15, _$createComponent(For, {
            get each() {
              return breakdown();
            },
            children: segment => (() => {
              var _el$20 = _tmpl$7(),
                _el$21 = _el$20.firstChild,
                _el$22 = _el$21.nextSibling,
                _el$23 = _el$22.nextSibling,
                _el$24 = _el$23.firstChild;
              _$insert(_el$22, () => breakdownLabel(segment.key));
              _$insert(_el$23, () => segment.percent.toLocaleString(language.intl()), _el$24);
              _$effect(_$p => _$setStyleProperty(_el$21, "background-color", BREAKDOWN_COLOR[segment.key]));
              return _el$20;
            })()
          }));
          _$insert(_el$16, () => language.t("context.breakdown.note"));
          return _el$12;
        }
      }), _el$17);
      _$insert(_el$10, _$createComponent(Show, {
        get when() {
          return systemPrompt();
        },
        children: prompt => (() => {
          var _el$25 = _tmpl$8(),
            _el$26 = _el$25.firstChild,
            _el$27 = _el$26.nextSibling;
          _$insert(_el$26, () => language.t("context.systemPrompt.title"));
          _$insert(_el$27, _$createComponent(Markdown, {
            get text() {
              return prompt();
            },
            "class": "small fw-normal"
          }));
          return _el$25;
        })()
      }), _el$17);
      _$insert(_el$18, () => language.t("context.rawMessages.title"));
      _$insert(_el$17, _$createComponent(Accordion, {
        multiple: true,
        get children() {
          return _$createComponent(For, {
            get each() {
              return messages();
            },
            children: message => _$createComponent(RawMessage, {
              message: message,
              getParts: getParts,
              onRendered: restoreScroll,
              get time() {
                return formatter().time;
              }
            })
          });
        }
      }), null);
      return _el$10;
    }
  });
}