import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="w-screen h-screen bg-background-base flex items-center justify-center"><div class="flex flex-col items-center gap-11"><div class="w-60 flex flex-col items-center gap-4"aria-live=polite><span class="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">`);
import { MetaProvider } from "@solidjs/meta";
import { render } from "solid-js/web";
import "app/index.css";
import { Font } from "@/vendor/ui/components/font.js";
import { Splash } from "@/vendor/ui/components/logo.js";
import { Progress } from "@/vendor/ui/components/progress.js";
import "./styles.css";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
const root = document.getElementById("root");
const lines = ["Just a moment...", "Migrating your database", "This may take a couple of minutes"];
const delays = [3000, 9000];
render(() => {
  const [step, setStep] = createSignal(null);
  const [line, setLine] = createSignal(0);
  const [percent, setPercent] = createSignal(0);
  const phase = createMemo(() => step()?.phase);
  const value = createMemo(() => {
    if (phase() === "done") return 100;
    return Math.max(25, Math.min(100, percent()));
  });
  window.api.awaitInitialization(next => setStep(next)).catch(() => undefined);
  onMount(() => {
    setLine(0);
    setPercent(0);
    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms));
    const listener = window.api.onSqliteMigrationProgress(progress => {
      if (progress.type === "InProgress") setPercent(Math.max(0, Math.min(100, progress.value)));
      if (progress.type === "Done") {
        setPercent(100);
        setStep({
          phase: "done"
        });
      }
    });
    onCleanup(() => {
      listener();
      timers.forEach(clearTimeout);
    });
  });
  createEffect(() => {
    if (phase() !== "done") return;
    const timer = setTimeout(() => window.api.loadingWindowComplete(), 1000);
    onCleanup(() => clearTimeout(timer));
  });
  const status = createMemo(() => {
    if (phase() === "done") return "All done";
    if (phase() === "sqlite_waiting") return lines[line()];
    return "Just a moment...";
  });
  return _$createComponent(MetaProvider, {
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild;
      _$insert(_el$, _$createComponent(Font, {}), _el$2);
      _$insert(_el$2, _$createComponent(Splash, {
        "class": "w-20 h-25 opacity-15"
      }), _el$3);
      _$insert(_el$4, status);
      _$insert(_el$3, _$createComponent(Progress, {
        get value() {
          return value();
        },
        "class": "w-20 [&_[data-slot='progress-track']]:h-1 [&_[data-slot='progress-track']]:border-0 [&_[data-slot='progress-track']]:rounded-none [&_[data-slot='progress-track']]:bg-surface-weak [&_[data-slot='progress-fill']]:rounded-none [&_[data-slot='progress-fill']]:bg-icon-warning-base",
        "aria-label": "Database migration progress",
        getValueLabel: ({
          value
        }) => `${Math.round(value)}%`
      }), null);
      return _el$;
    }
  });
}, root);