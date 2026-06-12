import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, on, onCleanup } from "solid-js";
import { useI18n } from "../context/i18n.js";
import { Card } from "./card.js";
import { Tooltip } from "./tooltip.js";
import { Spinner } from "./spinner.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function SessionRetry(props) {
  const i18n = useI18n();
  const retry = createMemo(() => {
    if (props.status.type !== "retry") return;
    return props.status;
  });
  const [seconds, setSeconds] = createSignal(0);
  createEffect(on(retry, current => {
    if (!current) return;
    const update = () => {
      const next = retry()?.next;
      if (!next) return;
      setSeconds(Math.round((next - Date.now()) / 1000));
    };
    update();
    const timer = setInterval(update, 1000);
    onCleanup(() => clearInterval(timer));
  }));
  const message = createMemo(() => {
    const current = retry();
    if (!current) return "";
    if (current.message.includes("exceeded your current quota") && current.message.includes("gemini")) {
      return i18n.t("ui.sessionTurn.retry.geminiHot");
    }
    if (current.message.length > 80) return current.message.slice(0, 80) + "...";
    return current.message;
  });
  const truncated = createMemo(() => {
    const current = retry();
    if (!current) return false;
    return current.message.length > 80;
  });
  const info = createMemo(() => {
    const current = retry();
    if (!current) return "";
    const count = Math.max(0, seconds());
    const delay = count > 0 ? i18n.t("ui.sessionTurn.retry.inSeconds", {
      seconds: count
    }) : "";
    const retrying = i18n.t("ui.sessionTurn.retry.retrying");
    const line = [retrying, delay].filter(Boolean).join(" ");
    if (!line) return i18n.t("ui.sessionTurn.retry.attempt", {
      attempt: current.attempt
    });
    return i18n.t("ui.sessionTurn.retry.attemptLine", {
      line,
      attempt: current.attempt
    });
  });

  // Show(retry && show), non-keyed: this boolean memo only changes on
  // truthiness flips, so the card subtree below is rebuilt exactly when the
  // compiled Show remounted it (and torn down while hidden).
  const visible = createMemo(() => !!retry() && (props.show ?? true));

  const build = () => {
    const root = template(`<div data-slot="session-turn-retry"></div>`);
    const row = template(`<div class="d-flex align-items-start gap-2"><div class="min-w-0"></div></div>`);
    const body = row.firstElementChild;
    row.insertBefore(createComponent(Spinner, {
      "class": "size-4 mt-0.5"
    }), body);

    // Show(truncated) with fallback: swap between the tooltip-wrapped and the
    // plain message div only when the truncation flag flips; the message text
    // itself stays live inside whichever div is mounted. Tooltip is still
    // compiled Solid (Kobalte, presence-gated), so its accessor result must
    // flow through solid's insert() (established exception); the null marker
    // keeps this region's position stable next to the info line.
    _solidInsert(body, createMemo(() => {
      if (!truncated()) {
        const messageEl = template(`<div data-slot="session-turn-retry-message"></div>`);
        createRenderEffect(() => {
          messageEl.textContent = message();
        });
        return messageEl;
      }
      return createComponent(Tooltip, {
        get value() {
          return retry()?.message ?? "";
        },
        placement: "top",
        get children() {
          const messageEl = template(`<div data-slot="session-turn-retry-message" class="cursor-help truncate"></div>`);
          createRenderEffect(() => {
            messageEl.textContent = message();
          });
          return messageEl;
        }
      });
    }), null);

    // Show(info()): mount the info line only while the string is non-empty;
    // the text itself tracks the live countdown/attempt message.
    const hasInfo = createMemo(() => !!info());
    _solidInsert(body, createMemo(() => {
      if (!hasInfo()) return undefined;
      const infoEl = template(`<div data-slot="session-turn-retry-info"></div>`);
      createRenderEffect(() => {
        infoEl.textContent = info();
      });
      return infoEl;
    }), null);

    root.appendChild(createComponent(Card, {
      variant: "error",
      "class": "error-card",
      children: row
    }));
    return root;
  };

  return createMemo(() => (visible() ? build() : undefined));
}
