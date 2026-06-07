import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=session-turn-retry-message class="cursor-help truncate">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-start gap-2"><div class=min-w-0>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=session-turn-retry>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-slot=session-turn-retry-message>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=session-turn-retry-info>`);
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { useI18n } from "../context/i18n.js";
import { Card } from "./card.js";
import { Tooltip } from "./tooltip.js";
import { Spinner } from "./spinner.js";
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
  return _$createComponent(Show, {
    get when() {
      return _$memo(() => !!retry())() && (props.show ?? true);
    },
    get children() {
      var _el$ = _tmpl$3();
      _$insert(_el$, _$createComponent(Card, {
        variant: "error",
        "class": "error-card",
        get children() {
          var _el$2 = _tmpl$2(),
            _el$3 = _el$2.firstChild;
          _$insert(_el$2, _$createComponent(Spinner, {
            "class": "size-4 mt-0.5"
          }), _el$3);
          _$insert(_el$3, _$createComponent(Show, {
            get when() {
              return truncated();
            },
            get fallback() {
              return (() => {
                var _el$5 = _tmpl$4();
                _$insert(_el$5, message);
                return _el$5;
              })();
            },
            get children() {
              return _$createComponent(Tooltip, {
                get value() {
                  return retry()?.message ?? "";
                },
                placement: "top",
                get children() {
                  var _el$4 = _tmpl$();
                  _$insert(_el$4, message);
                  return _el$4;
                }
              });
            }
          }), null);
          _$insert(_el$3, _$createComponent(Show, {
            get when() {
              return info();
            },
            children: line => (() => {
              var _el$6 = _tmpl$5();
              _$insert(_el$6, line);
              return _el$6;
            })()
          }), null);
          return _el$2;
        }
      }));
      return _el$;
    }
  });
}