import { createComponent, createMemo, createRenderEffect, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { useMutation } from "@tanstack/solid-query";
import { Button } from "@/bs/button.js";
import { DockPrompt } from "@/vendor/ui/components/dock-prompt.js";
import { Icon } from "@/bs/icon.js";
import { showToast } from "@/lib/toast.js";
import { useLanguage } from "@/context/language.js";
import { useComposerController } from "@/controllers/session-composer.js";
import { makeEventListener } from "@/lib/primitives/event-listener.js";
import { createResizeObserver } from "@/lib/primitives/resize-observer.js";
const cache = new Map();

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated and
// user-provided strings are always assigned via textContent, never
// interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
function Mark(props) {
  const root = template(`<span data-slot="question-option-check" aria-hidden="true"><span data-slot="question-option-box"></span></span>`);
  const box = root.firstChild;
  // onClick is a static prop (set only on the custom row); the compiled
  // delegated listener was a no-op when it was undefined.
  if (props.onClick) root.addEventListener("click", props.onClick);
  // Show(when=multi): swap the inner mark between the check icon and the
  // radio dot. props.multi is a memo-backed boolean, so this re-runs only
  // when the branch actually changes, like the original Show.
  createRenderEffect(() => {
    box.replaceChildren(props.multi ? createComponent(Icon, {
      name: "check-small",
      size: "small"
    }) : template(`<span data-slot="question-option-radio-dot"></span>`));
  });
  // Change-guarded reactive attributes, mirroring the compiled effect().
  let prevType;
  let prevPicked;
  createRenderEffect(() => {
    const type = props.multi ? "checkbox" : "radio";
    const picked = props.picked;
    if (type !== prevType) box.setAttribute("data-type", prevType = type);
    if (picked !== prevPicked) box.setAttribute("data-picked", prevPicked = picked);
  });
  return root;
}
function Option(props) {
  const root = template(`<button type="button" data-slot="question-option"><span data-slot="question-option-main"><span data-slot="option-label"></span></span></button>`);
  const main = root.firstChild;
  const labelEl = main.firstChild;
  // onClick/onFocus are static props, like the compiled listeners.
  root.addEventListener("click", props.onClick);
  root.addEventListener("focus", props.onFocus);
  if (typeof props.ref === "function") props.ref(root);
  else props.ref = root;
  root.insertBefore(createComponent(Mark, {
    get multi() {
      return props.multi;
    },
    get picked() {
      return props.picked;
    }
  }), main);
  createRenderEffect(() => {
    labelEl.textContent = props.label ?? "";
  });
  // Show(when=description): mount the description span only while truthy;
  // its text updates in place on truthy-to-truthy changes.
  let descEl;
  createRenderEffect(() => {
    const description = props.description;
    if (description) {
      if (!descEl) {
        descEl = template(`<span data-slot="option-description"></span>`);
        main.appendChild(descEl);
      }
      descEl.textContent = description;
      return;
    }
    if (descEl) {
      descEl.remove();
      descEl = undefined;
    }
  });
  // Change-guarded reactive attributes, mirroring the compiled effect().
  let prevPicked;
  let prevRole;
  let prevChecked;
  let prevDisabled;
  createRenderEffect(() => {
    const picked = props.picked;
    const role = props.multi ? "checkbox" : "radio";
    const disabled = props.disabled;
    if (picked !== prevPicked) root.setAttribute("data-picked", prevPicked = picked);
    if (role !== prevRole) root.setAttribute("role", prevRole = role);
    if (picked !== prevChecked) root.setAttribute("aria-checked", prevChecked = picked);
    if (disabled !== prevDisabled) root.disabled = prevDisabled = disabled;
  });
  return root;
}
export const SessionQuestionDock = props => {
  const composer = useComposerController();
  const language = useLanguage();
  const questions = createMemo(() => props.request.questions);
  const total = createMemo(() => questions().length);
  const cached = cache.get(props.request.id);
  const [store, setStore] = createStore({
    tab: cached?.tab ?? 0,
    answers: cached?.answers ?? [],
    custom: cached?.custom ?? [],
    customOn: cached?.customOn ?? [],
    editing: false,
    focus: 0
  });
  let root;
  let customRef;
  let optsRef = [];
  let replied = false;
  let focusFrame;
  const question = createMemo(() => questions()[store.tab]);
  const options = createMemo(() => question()?.options ?? []);
  const input = createMemo(() => store.custom[store.tab] ?? "");
  const on = createMemo(() => store.customOn[store.tab] === true);
  const multi = createMemo(() => question()?.multiple === true);
  const count = createMemo(() => options().length + 1);
  const summary = createMemo(() => {
    const n = Math.min(store.tab + 1, total());
    return language.t("session.question.progress", {
      current: n,
      total: total()
    });
  });
  const customLabel = () => language.t("ui.messagePart.option.typeOwnAnswer");
  const customPlaceholder = () => language.t("ui.question.custom.placeholder");
  const last = createMemo(() => store.tab >= total() - 1);
  const customUpdate = (value, selected = on()) => {
    const prev = input().trim();
    const next = value.trim();
    setStore("custom", store.tab, value);
    if (!selected) return;
    if (multi()) {
      setStore("answers", store.tab, (current = []) => {
        const removed = prev ? current.filter(item => item.trim() !== prev) : current;
        if (!next) return removed;
        if (removed.some(item => item.trim() === next)) return removed;
        return [...removed, next];
      });
      return;
    }
    setStore("answers", store.tab, next ? [next] : []);
  };
  const measure = () => {
    if (!root) return;
    const scroller = document.querySelector(".scroll-view__viewport");
    const head = scroller instanceof HTMLElement ? scroller.firstElementChild : undefined;
    const top = head instanceof HTMLElement && head.classList.contains("sticky") ? head.getBoundingClientRect().bottom : 0;
    if (!top) {
      root.style.removeProperty("--question-prompt-max-height");
      return;
    }
    const dock = root.closest('[data-component="session-prompt-dock"]');
    if (!(dock instanceof HTMLElement)) return;
    const dockBottom = dock.getBoundingClientRect().bottom;
    const below = Math.max(0, dockBottom - root.getBoundingClientRect().bottom);
    const gap = 8;
    const max = Math.max(240, Math.floor(dockBottom - top - gap - below));
    root.style.setProperty("--question-prompt-max-height", `${max}px`);
  };
  const clamp = i => Math.max(0, Math.min(count() - 1, i));
  const pickFocus = (tab = store.tab) => {
    const list = questions()[tab]?.options ?? [];
    if (store.customOn[tab] === true) return list.length;
    return Math.max(0, list.findIndex(item => store.answers[tab]?.includes(item.label) ?? false));
  };
  const focus = i => {
    const next = clamp(i);
    setStore("focus", next);
    if (store.editing) return;
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      const el = next === options().length ? customRef : optsRef[next];
      el?.focus();
    });
  };
  onMount(() => {
    let raf;
    const update = () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = undefined;
        measure();
      });
    };
    update();
    makeEventListener(window, "resize", update);
    const dock = root?.closest('[data-component="session-prompt-dock"]');
    const scroller = document.querySelector(".scroll-view__viewport");
    createResizeObserver([dock, scroller], update);
    onCleanup(() => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    });
    focus(pickFocus());
  });
  onCleanup(() => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    if (replied) return;
    cache.set(props.request.id, {
      tab: store.tab,
      answers: store.answers.map(a => a ? [...a] : []),
      custom: store.custom.map(s => s ?? ""),
      customOn: store.customOn.map(b => b ?? false)
    });
  });
  const fail = err => {
    const message = err instanceof Error ? err.message : String(err);
    showToast({
      title: language.t("common.requestFailed"),
      description: message
    });
  };
  const replyMutation = useMutation(() => ({
    mutationFn: answers => composer.replyQuestion({
      requestID: props.request.id,
      answers
    }),
    onMutate: () => {
      props.onSubmit();
    },
    onSuccess: () => {
      replied = true;
      cache.delete(props.request.id);
    },
    onError: fail
  }));
  const rejectMutation = useMutation(() => ({
    mutationFn: () => composer.rejectQuestion({
      requestID: props.request.id
    }),
    onMutate: () => {
      props.onSubmit();
    },
    onSuccess: () => {
      replied = true;
      cache.delete(props.request.id);
    },
    onError: fail
  }));
  const sending = createMemo(() => replyMutation.isPending || rejectMutation.isPending);
  const reply = async answers => {
    if (sending()) return;
    await replyMutation.mutateAsync(answers);
  };
  const reject = async () => {
    if (sending()) return;
    await rejectMutation.mutateAsync();
  };
  const submit = () => void reply(questions().map((_, i) => store.answers[i] ?? []));
  const answered = i => {
    if ((store.answers[i]?.length ?? 0) > 0) return true;
    return store.customOn[i] === true && (store.custom[i] ?? "").trim().length > 0;
  };
  const picked = answer => store.answers[store.tab]?.includes(answer) ?? false;
  const pick = (answer, custom = false) => {
    setStore("answers", store.tab, [answer]);
    if (custom) setStore("custom", store.tab, answer);
    if (!custom) setStore("customOn", store.tab, false);
    setStore("editing", false);
  };
  const toggle = answer => {
    setStore("answers", store.tab, (current = []) => {
      if (current.includes(answer)) return current.filter(item => item !== answer);
      return [...current, answer];
    });
  };
  const customToggle = () => {
    if (sending()) return;
    setStore("focus", options().length);
    if (!multi()) {
      setStore("customOn", store.tab, true);
      setStore("editing", true);
      customUpdate(input(), true);
      return;
    }
    const next = !on();
    setStore("customOn", store.tab, next);
    if (next) {
      setStore("editing", true);
      customUpdate(input(), true);
      return;
    }
    const value = input().trim();
    if (value) setStore("answers", store.tab, (current = []) => current.filter(item => item.trim() !== value));
    setStore("editing", false);
    focus(options().length);
  };
  const customOpen = () => {
    if (sending()) return;
    setStore("focus", options().length);
    if (!on()) setStore("customOn", store.tab, true);
    setStore("editing", true);
    customUpdate(input(), true);
  };
  const move = step => {
    if (store.editing || sending()) return;
    focus(store.focus + step);
  };
  const nav = event => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      // The compiled original delegated this handler, so the custom
      // textarea's own keydown listener ran first and its preventDefault()
      // made the defaultPrevented guard above skip the reject. The vanilla
      // DockPrompt dispatches onKeyDown in the capture phase instead, so
      // skip explicitly: Escape inside the textarea only exits editing.
      if (event.target instanceof HTMLElement && event.target.matches('[data-slot="question-custom-input"]')) return;
      event.preventDefault();
      void reject();
      return;
    }
    const mod = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (mod && event.key === "Enter") {
      if (event.repeat) return;
      event.preventDefault();
      next();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-slot="question-options"]') : undefined;
    if (store.editing) return;
    if (!(target instanceof HTMLElement)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focus(0);
      return;
    }
    if (event.key !== "End") return;
    event.preventDefault();
    focus(count() - 1);
  };
  const selectOption = optIndex => {
    if (sending()) return;
    if (optIndex === options().length) {
      customOpen();
      return;
    }
    const opt = options()[optIndex];
    if (!opt) return;
    if (multi()) {
      setStore("editing", false);
      toggle(opt.label);
      return;
    }
    pick(opt.label);
  };
  const commitCustom = () => {
    setStore("editing", false);
    customUpdate(input());
    focus(options().length);
  };
  const resizeInput = el => {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };
  const focusCustom = el => {
    setTimeout(() => {
      el.focus();
      resizeInput(el);
    }, 0);
  };
  const toggleCustomMark = event => {
    event.preventDefault();
    event.stopPropagation();
    customToggle();
  };
  const next = () => {
    if (sending()) return;
    if (store.editing) commitCustom();
    if (store.tab >= total() - 1) {
      submit();
      return;
    }
    const tab = store.tab + 1;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  const back = () => {
    if (sending()) return;
    if (store.tab <= 0) return;
    const tab = store.tab - 1;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  const jump = tab => {
    if (sending()) return;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  // ---- header: title + progress segments ----
  const titleEl = template(`<div data-slot="question-header-title"></div>`);
  createRenderEffect(() => {
    titleEl.textContent = summary();
  });
  const progressEl = template(`<div data-slot="question-progress"></div>`);
  // For over questions(): the array identity only changes with the request,
  // so a wholesale rebuild matches the compiled For; per-segment state tracks
  // through nested effects on stable nodes.
  createRenderEffect(() => {
    progressEl.replaceChildren(...questions().map((_, i) => {
      const seg = template(`<button type="button" data-slot="question-progress-segment"></button>`);
      seg.addEventListener("click", () => jump(i));
      let prevActive;
      let prevAnswered;
      let prevDisabled;
      let prevLabel;
      createRenderEffect(() => {
        const active = i === store.tab;
        const done = answered(i);
        const disabled = sending();
        const label = `${language.t("ui.tool.questions")} ${i + 1}`;
        if (active !== prevActive) seg.setAttribute("data-active", prevActive = active);
        if (done !== prevAnswered) seg.setAttribute("data-answered", prevAnswered = done);
        if (disabled !== prevDisabled) seg.disabled = prevDisabled = disabled;
        if (label !== prevLabel) seg.setAttribute("aria-label", prevLabel = label);
      });
      return seg;
    }));
  });

  // ---- footer: dismiss + (back?) + next/submit ----
  // The vanilla Button reads `children` and `variant` once at creation, so
  // each button is rebuilt in place when its label or variant changes (locale
  // switch, tab moves); `disabled` stays live through its getter.
  let dismissBtn;
  createRenderEffect(() => {
    const label = language.t("ui.common.dismiss");
    const btn = createComponent(Button, {
      variant: "ghost",
      size: "large",
      get disabled() {
        return sending();
      },
      onClick: reject,
      "aria-keyshortcuts": "Escape",
      children: label
    });
    if (dismissBtn) dismissBtn.replaceWith(btn);
    dismissBtn = btn;
  });
  const actionsEl = template(`<div data-slot="question-footer-actions"></div>`);
  // Show(when=store.tab > 0): the back button mounts before the next button.
  const showBack = createMemo(() => store.tab > 0);
  let backBtn;
  createRenderEffect(() => {
    if (!showBack()) {
      if (backBtn) {
        backBtn.remove();
        backBtn = undefined;
      }
      return;
    }
    const label = language.t("ui.common.back");
    const btn = createComponent(Button, {
      variant: "secondary",
      size: "large",
      get disabled() {
        return sending();
      },
      onClick: back,
      children: label
    });
    if (backBtn) backBtn.replaceWith(btn);
    else actionsEl.insertBefore(btn, actionsEl.firstChild);
    backBtn = btn;
  });
  let nextBtn;
  createRenderEffect(() => {
    const isLast = last();
    const label = isLast ? language.t("ui.common.submit") : language.t("ui.common.next");
    const btn = createComponent(Button, {
      variant: isLast ? "primary" : "secondary",
      size: "large",
      get disabled() {
        return sending();
      },
      onClick: next,
      "aria-keyshortcuts": "Meta+Enter Control+Enter",
      children: label
    });
    if (nextBtn) nextBtn.replaceWith(btn);
    else actionsEl.appendChild(btn);
    nextBtn = btn;
  });

  // ---- content: question text + hint + options ----
  const questionTextEl = template(`<div data-slot="question-text"></div>`);
  createRenderEffect(() => {
    questionTextEl.textContent = question()?.question ?? "";
  });
  // Show(when=multi()): both branches rendered the same hint element, so keep
  // one node and swap the translated text (no mount-keyed styles exist).
  const hintEl = template(`<div data-slot="question-hint"></div>`);
  createRenderEffect(() => {
    hintEl.textContent = multi() ? language.t("ui.question.multiHint") : language.t("ui.question.singleHint");
  });
  const optionsEl = template(`<div data-slot="question-options"></div>`);

  // Custom row, fallback branch of Show(when=store.editing): the "type your
  // own answer" button.
  const buildCustomButton = () => {
    const row = template(`<button type="button" data-slot="question-option" data-custom="true"><span data-slot="question-option-main"><span data-slot="option-label"></span><span data-slot="option-description"></span></span></button>`);
    const main = row.firstChild;
    const labelEl = main.firstChild;
    const previewEl = labelEl.nextSibling;
    row.addEventListener("click", customOpen);
    row.addEventListener("focus", () => setStore("focus", options().length));
    customRef = row;
    row.insertBefore(createComponent(Mark, {
      get multi() {
        return multi();
      },
      get picked() {
        return on();
      },
      onClick: toggleCustomMark
    }), main);
    createRenderEffect(() => {
      labelEl.textContent = customLabel();
    });
    createRenderEffect(() => {
      previewEl.textContent = input() || customPlaceholder();
    });
    let prevPicked;
    let prevRole;
    let prevChecked;
    let prevDisabled;
    createRenderEffect(() => {
      const pickedNow = on();
      const role = multi() ? "checkbox" : "radio";
      const disabledNow = sending();
      if (pickedNow !== prevPicked) row.setAttribute("data-picked", prevPicked = pickedNow);
      if (role !== prevRole) row.setAttribute("role", prevRole = role);
      if (pickedNow !== prevChecked) row.setAttribute("aria-checked", prevChecked = pickedNow);
      if (disabledNow !== prevDisabled) row.disabled = prevDisabled = disabledNow;
    });
    return row;
  };
  // Custom row, editing branch: label + autosizing textarea inside a form.
  const buildCustomForm = () => {
    const row = template(`<form data-slot="question-option" data-custom="true"><span data-slot="question-option-main"><span data-slot="option-label"></span><textarea data-slot="question-custom-input" rows="1"></textarea></span></form>`);
    const main = row.firstChild;
    const labelEl = main.firstChild;
    const inputEl = labelEl.nextSibling;
    row.addEventListener("submit", e => {
      e.preventDefault();
      commitCustom();
    });
    row.addEventListener("mousedown", e => {
      if (sending()) {
        e.preventDefault();
        return;
      }
      if (e.target instanceof HTMLTextAreaElement) return;
      const field = e.currentTarget.querySelector('[data-slot="question-custom-input"]');
      if (field instanceof HTMLTextAreaElement) field.focus();
    });
    row.insertBefore(createComponent(Mark, {
      get multi() {
        return multi();
      },
      get picked() {
        return on();
      },
      onClick: toggleCustomMark
    }), main);
    createRenderEffect(() => {
      labelEl.textContent = customLabel();
    });
    inputEl.addEventListener("input", e => {
      customUpdate(e.currentTarget.value);
      resizeInput(e.currentTarget);
    });
    inputEl.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        setStore("editing", false);
        focus(options().length);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      commitCustom();
    });
    // use:focusCustom ran at creation in the compiled output.
    focusCustom(inputEl);
    let prevPicked;
    let prevRole;
    let prevChecked;
    let prevPlaceholder;
    let prevDisabled;
    createRenderEffect(() => {
      const pickedNow = on();
      const role = multi() ? "checkbox" : "radio";
      const placeholder = customPlaceholder();
      const disabledNow = sending();
      if (pickedNow !== prevPicked) row.setAttribute("data-picked", prevPicked = pickedNow);
      if (role !== prevRole) row.setAttribute("role", prevRole = role);
      if (pickedNow !== prevChecked) row.setAttribute("aria-checked", prevChecked = pickedNow);
      if (placeholder !== prevPlaceholder) inputEl.setAttribute("placeholder", prevPlaceholder = placeholder);
      if (disabledNow !== prevDisabled) inputEl.disabled = prevDisabled = disabledNow;
    });
    createRenderEffect(() => {
      inputEl.value = input();
    });
    return row;
  };
  let customRow;
  let optionRows = [];
  // For over options(): rebuild rows when the array identity changes (tab
  // switch). picked/disabled/role updates flow through nested effects, so the
  // rows (and DOM focus) stay stable across answer changes.
  createRenderEffect(() => {
    const opts = options();
    const rows = opts.map((opt, i) => createComponent(Option, {
      get multi() {
        return multi();
      },
      get picked() {
        return picked(opt.label);
      },
      get label() {
        return opt.label;
      },
      get description() {
        return opt.description;
      },
      get disabled() {
        return sending();
      },
      ref: el => optsRef[i] = el,
      onFocus: () => setStore("focus", i),
      onClick: () => selectOption(i)
    }));
    for (const row of optionRows) row.remove();
    optionRows = rows;
    const anchor = customRow ?? null;
    for (const row of rows) optionsEl.insertBefore(row, anchor);
  });
  // Show(when=store.editing): swap between the custom button and the inline
  // form, remounting per toggle exactly like the original (the form refocuses
  // its textarea on each mount).
  createRenderEffect(() => {
    const row = store.editing ? buildCustomForm() : buildCustomButton();
    if (customRow) customRow.replaceWith(row);
    else optionsEl.appendChild(row);
    customRow = row;
  });
  return createComponent(DockPrompt, {
    kind: "question",
    ref: el => root = el,
    onKeyDown: nav,
    get header() {
      return [titleEl, progressEl];
    },
    get footer() {
      return [dismissBtn, actionsEl];
    },
    get children() {
      return [questionTextEl, hintEl, optionsEl];
    }
  });
};