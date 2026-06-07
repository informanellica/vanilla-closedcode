import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-slot=text-shimmer-char><span data-slot=text-shimmer-char-base aria-hidden=true></span><span data-slot=text-shimmer-char-shimmer aria-hidden=true>`);
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
export const TextShimmer = props => {
  const text = createMemo(() => props.text ?? "");
  const active = createMemo(() => props.active ?? true);
  const offset = createMemo(() => props.offset ?? 0);
  const [run, setRun] = createSignal(active());
  const swap = 220;
  let timer;
  createEffect(() => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (active()) {
      setRun(true);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      setRun(false);
    }, swap);
  });
  onCleanup(() => {
    if (!timer) return;
    clearTimeout(timer);
  });
  return _$createComponent(Dynamic, {
    get component() {
      return props.as ?? "span";
    },
    "data-component": "text-shimmer",
    get ["data-active"]() {
      return active() ? "true" : "false";
    },
    get ["class"]() {
      return props.class;
    },
    get ["aria-label"]() {
      return text();
    },
    get style() {
      return {
        "--text-shimmer-swap": `${swap}ms`,
        "--text-shimmer-index": `${offset()}`
      };
    },
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;
      _$insert(_el$2, text);
      _$insert(_el$3, text);
      _$effect(() => _$setAttribute(_el$3, "data-run", run() ? "true" : "false"));
      return _el$;
    }
  });
};