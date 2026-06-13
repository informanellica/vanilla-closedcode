import { insert } from "solid-js/web";
import { createComponent, createEffect, createMemo, createRenderEffect, on, onCleanup, For } from "solid-js";
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

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web insert() semantics for primitive values: nothing for
// null/undefined/booleans, text otherwise.
function textValue(value) {
  return value == null || typeof value === "boolean" ? "" : String(value);
}

// Resolve Solid-style children: unwrap zero-arg accessors, flatten arrays,
// keep Nodes, stringify the rest. Used (inside a render effect) to mount
// the original component results — which resolve through context providers and
// Dynamic to memo accessors — into plain DOM.
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}
function Stat(props) {
  // Compiled _tmpl$: label over value. Both bound in render effects so the
  // label follows live language switches and the value follows the stat memos.
  const root = template(`<div class="d-flex flex-column gap-1"><div class="small fw-normal text-secondary"></div><div class="small fw-medium text-body-emphasis"></div></div>`);
  const labelEl = root.firstChild;
  const valueEl = labelEl.nextSibling;
  createRenderEffect(() => {
    labelEl.textContent = textValue(props.label);
  });
  createRenderEffect(() => {
    valueEl.textContent = textValue(props.value);
  });
  return root;
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
  return createComponent(File, {
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
  return createComponent(Accordion.Item, {
    get value() {
      return props.message.id;
    },
    get children() {
      return [createComponent(StickyAccordionHeader, {
        get children() {
          return createComponent(Accordion.Trigger, {
            get children() {
              // Compiled _tmpl$2: "<role> <span>• <id></span>" on the left,
              // time + chevron on the right. role/id/time are bound in render
              // effects (time follows locale changes through props.time).
              const root = template(`<div class="d-flex align-items-center justify-content-between gap-2 w-100"><div class="min-w-0 truncate"> <span class="text-body">• </span></div><div class="d-flex align-items-center gap-3"><div class="shrink-0 small fw-normal text-secondary"></div></div></div>`);
              const left = root.firstChild;
              const space = left.firstChild;
              const idSpan = space.nextSibling;
              const right = left.nextSibling;
              const timeEl = right.firstChild;
              const roleText = document.createTextNode("");
              left.insertBefore(roleText, space);
              createRenderEffect(() => {
                roleText.data = textValue(props.message.role);
              });
              const idText = document.createTextNode("");
              idSpan.appendChild(idText);
              createRenderEffect(() => {
                idText.data = textValue(props.message.id);
              });
              createRenderEffect(() => {
                timeEl.textContent = textValue(props.time(props.message.time.created));
              });
              right.appendChild(createComponent(Icon, {
                name: "chevron-grabber-vertical",
                size: "small",
                "class": "shrink-0 text-secondary"
              }));
              return root;
            }
          });
        }
      }), createComponent(Accordion.Content, {
        "class": "bg-body",
        get children() {
          const body = template(`<div class="p-3"></div>`);
          // File resolves through FileMedia (a Show) to a possibly-function
          // value and remounts whenever this presence-gated Content
          // reopens, so it stays on solid's insert() (established exception).
          insert(body, createComponent(RawMessageContent, {
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
          return body;
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
  return createComponent(ScrollView, {
    "class": "@container h-full",
    viewportRef: el => {
      scroll = el;
      restoreScroll();
    },
    onScroll: handleScroll,
    get children() {
      // Compiled _tmpl$5 skeleton. The two conditional sections (breakdown,
      // system prompt) and the accordion render into display:contents slots,
      // which generate no boxes so the root keeps its flex-gap layout.
      const root = template(`<div class="px-6 pt-4 pb-10 d-flex flex-column gap-10"><div class="grid grid-cols-1 @[32rem]:grid-cols-2 gap-4"></div><div style="display:contents" data-slot="breakdown"></div><div style="display:contents" data-slot="system-prompt"></div><div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary"></div><div style="display:contents" data-slot="messages"></div></div></div>`);
      const statsGrid = root.firstChild;
      const breakdownSlot = statsGrid.nextSibling;
      const systemPromptSlot = breakdownSlot.nextSibling;
      const rawSection = systemPromptSlot.nextSibling;
      const rawTitle = rawSection.firstChild;
      const messagesSlot = rawTitle.nextSibling;

      // Static stats list; each Stat binds its own label/value reactively.
      for (const stat of stats) {
        statsGrid.appendChild(createComponent(Stat, {
          get label() {
            return language.t(stat.label);
          },
          get value() {
            return stat.value();
          }
        }));
      }

      // <Show when={breakdown().length > 0}>: the section is (re)built only
      // when the condition flips (truthiness equality, like non-keyed Show);
      // nested effects keep title/bar/legend/note live while mounted.
      const hasBreakdown = createMemo(() => breakdown().length > 0);
      createRenderEffect(() => {
        if (!hasBreakdown()) {
          breakdownSlot.replaceChildren();
          return;
        }
        const section = template(`<div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary"></div><div class="h-2 w-100 rounded-circle bg-body-tertiary overflow-hidden d-flex"></div><div class="d-flex flex-wrap gap-x-3 gap-y-1"></div><div class="d-none small fw-normal text-body-secondary"></div></div>`);
        const titleEl = section.firstChild;
        const barEl = titleEl.nextSibling;
        const legendEl = barEl.nextSibling;
        const noteEl = legendEl.nextSibling;
        createRenderEffect(() => {
          titleEl.textContent = textValue(language.t("context.breakdown.title"));
        });
        createRenderEffect(() => {
          barEl.replaceChildren(...breakdown().map(segment => {
            const seg = template(`<div class="h-full"></div>`);
            seg.style.setProperty("width", `${segment.width}%`);
            seg.style.setProperty("background-color", BREAKDOWN_COLOR[segment.key]);
            return seg;
          }));
        });
        // Legend rows read the translated labels and the locale, so the list
        // rebuilds on breakdown or language changes (rows hold no state, same
        // visual result as the original per-row inserts).
        createRenderEffect(() => {
          legendEl.replaceChildren(...breakdown().map(segment => {
            const row = template(`<div class="d-flex align-items-center gap-1 small fw-normal text-secondary"><div class="size-2 rounded-1"></div><div></div><div class="text-body-secondary">%</div></div>`);
            const dot = row.firstChild;
            const label = dot.nextSibling;
            const percent = label.nextSibling;
            dot.style.setProperty("background-color", BREAKDOWN_COLOR[segment.key]);
            label.textContent = textValue(breakdownLabel(segment.key));
            percent.insertBefore(document.createTextNode(textValue(segment.percent.toLocaleString(language.intl()))), percent.firstChild);
            return row;
          }));
        });
        createRenderEffect(() => {
          noteEl.textContent = textValue(language.t("context.breakdown.note"));
        });
        breakdownSlot.replaceChildren(section);
      });

      // <Show when={systemPrompt()}>: rebuilt on truthiness flips only; the
      // Markdown text getter keeps tracking systemPrompt() while mounted,
      // matching the non-keyed Show accessor the original passed along.
      const hasSystemPrompt = createMemo(() => !!systemPrompt());
      createRenderEffect(() => {
        if (!hasSystemPrompt()) {
          systemPromptSlot.replaceChildren();
          return;
        }
        const section = template(`<div class="d-flex flex-column gap-2"><div class="small fw-normal text-secondary"></div><div class="border rounded-2 bg-body-tertiary px-3 py-2"></div></div>`);
        const titleEl = section.firstChild;
        const bodyEl = titleEl.nextSibling;
        createRenderEffect(() => {
          titleEl.textContent = textValue(language.t("context.systemPrompt.title"));
        });
        bodyEl.appendChild(createComponent(Markdown, {
          get text() {
            return systemPrompt();
          },
          "class": "small fw-normal"
        }));
        systemPromptSlot.replaceChildren(section);
      });
      createRenderEffect(() => {
        rawTitle.textContent = textValue(language.t("context.rawMessages.title"));
      });

      // The accordion resolves to a memo accessor; create it once and
      // mount the resolved root element. For keeps per-message rows alive
      // across message updates, preserving expansion state and File viewers.
      const accordion = createComponent(Accordion, {
        multiple: true,
        get children() {
          return createComponent(For, {
            get each() {
              return messages();
            },
            children: message => createComponent(RawMessage, {
              message: message,
              getParts: getParts,
              onRendered: restoreScroll,
              get time() {
                return formatter().time;
              }
            })
          });
        }
      });
      createRenderEffect(() => {
        messagesSlot.replaceChildren(...resolveNodes(accordion));
      });
      return root;
    }
  });
}
