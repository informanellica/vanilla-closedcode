import { createComponent, createEffect, createMemo, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { useNavigate } from "@solidjs/router";
import { useSpring } from "@/vendor/ui/components/motion-spring.js";
import { PromptInput } from "@/components/prompt-input.js";
import { useLanguage } from "@/context/language.js";
import { usePrompt } from "@/context/prompt.js";
import { useSync } from "@/context/sync.js";
import { getSessionHandoff, setSessionHandoff } from "@/pages/session/handoff.js";
import { useSessionKey } from "@/pages/session/session-layout.js";
import { SessionPermissionDock } from "@/pages/session/composer/session-permission-dock.js";
import { SessionQuestionDock } from "@/pages/session/composer/session-question-dock.js";
import { SessionFollowupDock } from "@/pages/session/composer/session-followup-dock.js";
import { SessionRevertDock } from "@/pages/session/composer/session-revert-dock.js";
import { SessionTodoDock } from "@/pages/session/composer/session-todo-dock.js";
import { createResizeObserver } from "@solid-primitives/resize-observer";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function SessionComposerRegion(props) {
  const navigate = useNavigate();
  const prompt = usePrompt();
  const language = useLanguage();
  const route = useSessionKey();
  const sync = useSync();
  const handoffPrompt = createMemo(() => getSessionHandoff(route.sessionKey())?.prompt);
  const info = createMemo(() => route.params.id ? sync.session.get(route.params.id) : undefined);
  const parentID = createMemo(() => info()?.parentID);
  const child = createMemo(() => !!parentID());
  const showComposer = createMemo(() => !props.state.blocked() || child());
  const previewPrompt = () => prompt.current().map(part => {
    if (part.type === "file") return `[file:${part.path}]`;
    if (part.type === "agent") return `@${part.name}`;
    if (part.type === "image") return `[image:${part.filename}]`;
    return part.content;
  }).join("").trim();
  createEffect(() => {
    if (!prompt.ready()) return;
    setSessionHandoff(route.sessionKey(), {
      prompt: previewPrompt()
    });
  });
  const [store, setStore] = createStore({
    ready: false,
    height: 320,
    body: undefined
  });
  let timer;
  let frame;
  const clear = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
  createEffect(() => {
    route.sessionKey();
    const ready = props.ready;
    const delay = 140;
    clear();
    setStore("ready", false);
    if (!ready) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      timer = window.setTimeout(() => {
        setStore("ready", true);
        timer = undefined;
      }, delay);
    });
  });
  onCleanup(clear);
  const open = createMemo(() => store.ready && props.state.dock() && !props.state.closing());
  const progress = useSpring(() => open() ? 1 : 0, {
    visualDuration: 0.3,
    bounce: 0
  });
  const value = createMemo(() => Math.max(0, Math.min(1, progress())));
  const dock = createMemo(() => store.ready && props.state.dock() || value() > 0.001);
  const rolled = createMemo(() => props.revert?.items.length ? props.revert : undefined);
  const lift = createMemo(() => rolled() ? 18 : 36 * value());
  const full = createMemo(() => Math.max(78, store.height));
  const openParent = () => {
    const id = parentID();
    if (!id) return;
    navigate(`/${route.params.dir}/session/${id}`);
  };
  createEffect(() => {
    const el = store.body;
    if (!el) return;
    const update = () => setStore("height", el.getBoundingClientRect().height);
    createResizeObserver(store.body, update);
    update();
  });

  // Keyed Show conditions: memos notify on identity change (=== equality),
  // so the effects below remount their dock exactly when the request changes.
  const questionRequest = createMemo(() => props.state.questionRequest());
  const permissionRequest = createMemo(() => props.state.permissionRequest());

  // Both keyed revert Shows render the same dock; `revert` is the keyed
  // snapshot, so the getters mirror the original children closure.
  const revertDock = revert => createComponent(SessionRevertDock, {
    get items() {
      return revert.items;
    },
    get restoring() {
      return revert.restoring;
    },
    get disabled() {
      return revert.disabled;
    },
    get onRestore() {
      return revert.onRestore;
    }
  });

  // Static skeleton. The display:contents wrappers stand in for the compiled
  // insert() markers so each Show keeps its position without affecting layout.
  const root = template(`<div data-component="session-prompt-dock" class="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-body pointer-events-none"><div><div style="display: contents" data-slot="question"></div><div style="display: contents" data-slot="permission"></div><div style="display: contents" data-slot="composer"></div></div></div>`);
  const inner = root.firstElementChild;
  const questionSlot = inner.querySelector('[data-slot="question"]');
  const permissionSlot = inner.querySelector('[data-slot="permission"]');
  const composerSlot = inner.querySelector('[data-slot="composer"]');

  const dockRef = props.setPromptDockRef;
  if (typeof dockRef === "function") dockRef(root);
  else props.setPromptDockRef = root;

  inner.classList.add("w-full", "px-3", "pointer-events-auto");
  createEffect(() => {
    const centered = !!props.centered;
    for (const cls of ["md:max-w-200", "md:mx-auto", "2xl:max-w-[1000px]"]) {
      inner.classList.toggle(cls, centered);
    }
  });

  // Question dock (keyed Show: remounts whenever the request identity changes).
  createEffect(() => {
    const request = questionRequest();
    if (!request) {
      questionSlot.replaceChildren();
      return;
    }
    const holder = template(`<div></div>`);
    holder.appendChild(createComponent(SessionQuestionDock, {
      request: request,
      get onSubmit() {
        return props.onResponseSubmit;
      }
    }));
    questionSlot.replaceChildren(holder);
  });

  // Permission dock (keyed Show).
  createEffect(() => {
    const request = permissionRequest();
    if (!request) {
      permissionSlot.replaceChildren();
      return;
    }
    const holder = template(`<div></div>`);
    holder.appendChild(createComponent(SessionPermissionDock, {
      request: request,
      get responding() {
        return props.state.permissionResponding();
      },
      onDecide: response => {
        props.onResponseSubmit();
        props.state.decide(response);
      }
    }));
    permissionSlot.replaceChildren(holder);
  });

  // Fallback branch while the prompt context is not ready yet: optional revert
  // dock plus a read-only preview of the handed-off prompt text.
  const buildLoading = () => {
    const revertSlot = template(`<div style="display: contents"></div>`);
    createEffect(() => {
      const revert = rolled();
      if (!revert) {
        revertSlot.replaceChildren();
        return;
      }
      const holder = template(`<div class="pb-2"></div>`);
      holder.appendChild(revertDock(revert));
      revertSlot.replaceChildren(holder);
    });
    const preview = template(`<div class="w-full min-h-32 md:min-h-40 rounded-2 border bg-body px-4 py-3 text-secondary whitespace-pre-wrap pointer-events-none"></div>`);
    createEffect(() => {
      preview.textContent = handoffPrompt() || language.t("prompt.loading");
    });
    return [revertSlot, preview];
  };

  // Child-session notice shown instead of the prompt input. The original
  // applied the inputRef to this element and kept a trailing space after the
  // label inside the span, followed by the back-to-parent button.
  const buildChildNotice = () => {
    const notice = template(`<div class="w-full rounded-[12px] border bg-body p-3 fs-6 fw-normal text-secondary"><span> </span></div>`);
    const inputRef = props.inputRef;
    if (typeof inputRef === "function") inputRef(notice);
    else props.inputRef = notice;
    const span = notice.firstElementChild;
    const label = document.createTextNode("");
    span.insertBefore(label, span.firstChild);
    createEffect(() => {
      label.textContent = language.t("session.child.promptDisabled");
    });
    const buttonSlot = template(`<div style="display: contents"></div>`);
    notice.appendChild(buttonSlot);
    const hasParent = createMemo(() => !!parentID());
    createEffect(() => {
      if (!hasParent()) {
        buttonSlot.replaceChildren();
        return;
      }
      const button = template(`<button type="button" class="text-body transition-colors"></button>`);
      button.addEventListener("click", openParent);
      createEffect(() => {
        button.textContent = language.t("session.child.backToParent");
      });
      buttonSlot.replaceChildren(button);
    });
    return notice;
  };

  // Main branch once the prompt context is ready: collapsible todo dock,
  // optional revert dock, then the composer (followup dock + prompt input).
  const buildReady = () => {
    const dockSlot = template(`<div style="display: contents"></div>`);
    createEffect(() => {
      if (!dock()) {
        dockSlot.replaceChildren();
        return;
      }
      const wrap = template(`<div class="overflow-hidden"><div></div></div>`);
      const body = wrap.firstElementChild;
      setStore("body", body);
      body.appendChild(createComponent(SessionTodoDock, {
        get sessionID() {
          return route.params.id;
        },
        get todos() {
          return props.state.todos();
        },
        get collapseLabel() {
          return language.t("session.todo.collapse");
        },
        get expandLabel() {
          return language.t("session.todo.expand");
        },
        get dockProgress() {
          return value();
        }
      }));
      createEffect(() => {
        wrap.classList.toggle("pointer-events-none", value() < 0.98);
        wrap.style.setProperty("max-height", `${full() * value()}px`);
      });
      dockSlot.replaceChildren(wrap);
    });

    const revertSlot = template(`<div style="display: contents"></div>`);
    createEffect(() => {
      const revert = rolled();
      if (!revert) {
        revertSlot.replaceChildren();
        return;
      }
      const holder = template(`<div></div>`);
      holder.appendChild(revertDock(revert));
      createEffect(() => {
        holder.style.setProperty("margin-top", `${-36 * value()}px`);
      });
      revertSlot.replaceChildren(holder);
    });

    const composer = template(`<div class="relative z-10"><div style="display: contents" data-slot="followup"></div><div style="display: contents" data-slot="input"></div></div>`);
    const followupSlot = composer.querySelector('[data-slot="followup"]');
    const inputSlot = composer.querySelector('[data-slot="input"]');
    const hasFollowup = createMemo(() => !!props.followup?.items.length);
    createEffect(() => {
      if (!hasFollowup()) {
        followupSlot.replaceChildren();
        return;
      }
      followupSlot.replaceChildren(createComponent(SessionFollowupDock, {
        get items() {
          return props.followup.items;
        },
        get sending() {
          return props.followup.sending;
        },
        get onSend() {
          return props.followup.onSend;
        },
        get onEdit() {
          return props.followup.onEdit;
        }
      }));
    });
    createEffect(() => {
      if (child()) {
        inputSlot.replaceChildren(buildChildNotice());
        return;
      }
      // Nested effect mirrors the original Show fallback: the prompt input
      // only remounts when `blocked` flips while in the non-child branch.
      createEffect(() => {
        if (props.state.blocked()) {
          inputSlot.replaceChildren();
          return;
        }
        inputSlot.replaceChildren(createComponent(PromptInput, {
          ref(r) {
            const inputRef = props.inputRef;
            if (typeof inputRef === "function") inputRef(r);
            else props.inputRef = r;
          },
          get newSessionWorktree() {
            return props.newSessionWorktree;
          },
          get onNewSessionWorktreeReset() {
            return props.onNewSessionWorktreeReset;
          },
          get edit() {
            return props.followup?.edit;
          },
          get onEditLoaded() {
            return props.followup?.onEditLoaded;
          },
          get shouldQueue() {
            return props.followup?.queue;
          },
          get onQueue() {
            return props.followup?.onQueue;
          },
          get onAbort() {
            return props.followup?.onAbort;
          },
          get onSubmit() {
            return props.onSubmit;
          }
        }));
      });
    });
    createEffect(() => {
      composer.style.setProperty("margin-top", `${-lift()}px`);
    });
    return [dockSlot, revertSlot, composer];
  };

  // Nested Show pair: outer gate on showComposer(), inner switch on
  // prompt.ready() with the loading fallback. The memo collapses both into a
  // 3-state branch so content only remounts when the active branch changes
  // (matching non-keyed Show truthiness semantics).
  const branch = createMemo(() => {
    if (!showComposer()) return "none";
    return prompt.ready() ? "ready" : "loading";
  });
  createEffect(() => {
    const current = branch();
    if (current === "none") {
      composerSlot.replaceChildren();
      return;
    }
    composerSlot.replaceChildren(...(current === "ready" ? buildReady() : buildLoading()));
  });

  return root;
}
