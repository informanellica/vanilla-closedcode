import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-4 pl-6 pr-2.5 pb-3"><div class="d-flex flex-column gap-1"><span class="text-body-emphasis"></span></div><div class="d-flex justify-content-end gap-2">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-component=session-progress aria-hidden=true><div data-component=session-progress-bar>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<button type=button data-slot=session-title-parent class="min-w-0 max-w-[40%] truncate fw-medium text-secondary transition-colors">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span data-slot=session-title-separator class="px-2 fw-medium text-secondary"aria-hidden=true>/`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="transition-opacity duration-200 ease-out">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-session-title><div class="h-12 w-100 d-flex align-items-center justify-content-between gap-2"><div class="d-flex align-items-center gap-1 min-w-0 flex-1 pr-3"><div class="d-flex align-items-center min-w-0 grow-1"><div class="shrink-0 d-flex align-items-center justify-content-center overflow-hidden transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"aria-hidden=true>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="w-100 d-flex justify-content-center">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="min-w-0 w-100"><div role=log data-slot=session-turn-list class="d-flex flex-column align-items-start justify-content-start pb-16 transition-[margin]">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="relative w-full h-full min-w-0"><div class="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60] pointer-events-none transition-all duration-200 ease-out"><button class="pointer-events-auto d-flex align-items-center justify-content-center w-10 h-8 bg-transparent border-none cursor-pointer p-0 group"><div class="d-flex align-items-center justify-content-center w-8 h-6 rounded-[6px] border bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] backdrop-blur-[0.75px] transition-colors group-hover:border-[var(--border-weak-base)] group-hover:[--icon-base:var(--icon-hover)]"style="box-shadow:0 51px 60px 0 rgba(0,0,0,0.10), 0 15px 18px 0 rgba(0,0,0,0.12), 0 6.386px 7.513px 0 rgba(0,0,0,0.12), 0 2.31px 2.717px 0 rgba(0,0,0,0.20)">`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div class="relative h-full overflow-hidden">`),
  _tmpl$1 = /*#__PURE__*/_$template(`<h1 data-slot=session-title-child class="fw-medium text-body-emphasis truncate grow-1 min-w-0">`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2"><div class="grid grid-cols-2 gap-2">`),
  _tmpl$11 = /*#__PURE__*/_$template(`<div class="d-flex flex-column p-3"><div class="d-flex flex-column gap-1"><div class="fw-medium text-body-emphasis"></div><div class="small fw-normal text-secondary"></div></div><div class="mt-3 d-flex flex-column gap-2">`),
  _tmpl$12 = /*#__PURE__*/_$template(`<div class="shrink-0 d-flex align-items-center gap-3">`),
  _tmpl$13 = /*#__PURE__*/_$template(`<div class="w-100 px-4 md:px-5 pb-2"><div class="ml-auto max-w-[82%] overflow-x-auto no-scrollbar"><div class="d-flex w-max min-w-full justify-content-end gap-2">`),
  _tmpl$14 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$15 = /*#__PURE__*/_$template(`<div class="shrink-0 max-w-[260px] rounded-[6px] border bg-body px-2.5 py-2"><div class="d-flex align-items-center gap-1.5 min-w-0 small fw-medium text-body-emphasis"><span class=truncate></span></div><div class="pt-1 small fw-normal text-body-emphasis whitespace-pre-wrap break-words">`),
  _tmpl$16 = /*#__PURE__*/_$template(`<span class="shrink-0 text-secondary">`);
import { For, createEffect, createMemo, on, onCleanup, Show, Index, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { useMutation } from "@tanstack/solid-query";
import { useNavigate } from "@solidjs/router";
import { Button } from "@/bs/button.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Dialog } from "@/bs/dialog.js";
import { InlineInput } from "@/vendor/ui/components/inline-input.js";
import { Spinner } from "@/bs/spinner.js";
import { SessionTurn } from "@/vendor/ui/components/session-turn.js";
import { ScrollView } from "@/vendor/ui/components/scroll-view.js";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import { Binary } from "core/util/binary";
import { getFilename } from "core/util/path";
import { Popover as KobaltePopover } from "@kobalte/core/popover";
import { shouldMarkBoundaryGesture, normalizeWheelDelta } from "@/pages/session/message-gesture.js";
import { SessionContextUsage } from "@/components/session-context-usage.js";
import { useDialog } from "@/lib/dialog.js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { useLanguage } from "@/context/language.js";
import { useSessionKey } from "@/pages/session/session-layout.js";
import { usePlatform } from "@/context/platform.js";
import { useSessionController } from "@/controllers/session.js";
import { useSettings } from "@/context/settings.js";
import { useSync } from "@/context/sync.js";
import { messageAgentColor } from "@/utils/agent.js";
import { sessionTitle } from "@/utils/session-title.js";
import { parseCommentNote, readCommentMetadata } from "@/utils/comment-note.js";
import { makeTimer } from "@solid-primitives/timer";
const emptyMessages = [];
const idle = {
  type: "idle"
};
const messageComments = parts => parts.flatMap(part => {
  if (part.type !== "text" || !part.synthetic) return [];
  const next = readCommentMetadata(part.metadata) ?? parseCommentNote(part.text);
  if (!next) return [];
  return [{
    path: next.path,
    comment: next.comment,
    selection: next.selection ? {
      startLine: next.selection.startLine,
      endLine: next.selection.endLine
    } : undefined
  }];
});
const taskDescription = (part, sessionID) => {
  if (part.type !== "tool" || part.tool !== "task") return;
  const metadata = "metadata" in part.state ? part.state.metadata : undefined;
  if (metadata?.sessionId !== sessionID) return;
  const value = part.state.input?.description;
  if (typeof value === "string" && value) return value;
};
const pace = width => Math.round(Math.max(1200, Math.min(3200, Math.max(width, 360) * 2000 / 900)));
const boundaryTarget = (root, target) => {
  const current = target instanceof Element ? target : undefined;
  const nested = current?.closest("[data-scrollable]");
  if (!nested || nested === root) return root;
  if (!(nested instanceof HTMLElement)) return root;
  return nested;
};
const markBoundaryGesture = input => {
  const target = boundaryTarget(input.root, input.target);
  if (target === input.root) {
    input.onMarkScrollGesture(input.root);
    return;
  }
  if (shouldMarkBoundaryGesture({
    delta: input.delta,
    scrollTop: target.scrollTop,
    scrollHeight: target.scrollHeight,
    clientHeight: target.clientHeight
  })) {
    input.onMarkScrollGesture(input.root);
  }
};
/**
 * Defer-mounts small timeline windows so revealing older turns does not
 * block first paint with a large DOM mount.
 *
 * Once staging completes for a session it never re-stages — backfill and
 * new messages render immediately.
 */
function createTimelineStaging(input) {
  const [state, setState] = createStore({
    activeSession: "",
    completedSession: "",
    count: 0
  });
  const stagedCount = createMemo(() => {
    const total = input.messages().length;
    if (input.turnStart() <= 0) return total;
    if (state.completedSession === input.sessionKey()) return total;
    const init = Math.min(total, input.config.init);
    if (state.count <= init) return init;
    if (state.count >= total) return total;
    return state.count;
  });
  const stagedUserMessages = createMemo(() => {
    const list = input.messages();
    const count = stagedCount();
    if (count >= list.length) return list;
    return list.slice(Math.max(0, list.length - count));
  });
  let frame;
  const cancel = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
  };
  createEffect(on(() => [input.sessionKey(), input.turnStart() > 0, input.messages().length], ([sessionKey, isWindowed, total]) => {
    cancel();
    const shouldStage = isWindowed && total > input.config.init && state.completedSession !== sessionKey && state.activeSession !== sessionKey;
    if (!shouldStage) {
      setState({
        activeSession: "",
        count: total
      });
      return;
    }
    let count = Math.min(total, input.config.init);
    setState({
      activeSession: sessionKey,
      count
    });
    const step = () => {
      if (input.sessionKey() !== sessionKey) {
        frame = undefined;
        return;
      }
      const currentTotal = input.messages().length;
      count = Math.min(currentTotal, count + input.config.batch);
      setState("count", count);
      if (count >= currentTotal) {
        setState({
          completedSession: sessionKey,
          activeSession: ""
        });
        frame = undefined;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }));
  const isStaging = createMemo(() => {
    const key = input.sessionKey();
    return state.activeSession === key && state.completedSession !== key;
  });
  onCleanup(cancel);
  return {
    messages: stagedUserMessages,
    isStaging
  };
}
export function MessageTimeline(props) {
  let touchGesture;
  const navigate = useNavigate();
  const controller = useSessionController();
  const sync = useSync();
  const settings = useSettings();
  const dialog = useDialog();
  const language = useLanguage();
  const {
    params,
    sessionKey
  } = useSessionKey();
  const platform = usePlatform();
  const rendered = createMemo(() => props.renderedUserMessages.map(message => message.id));
  const sessionID = createMemo(() => params.id);
  const sessionMessages = createMemo(() => {
    const id = sessionID();
    if (!id) return emptyMessages;
    return sync.data?.message?.[id] ?? emptyMessages;
  });
  const pending = createMemo(() => (sessionMessages() ?? emptyMessages).findLast(item => item?.role === "assistant" && typeof item?.time?.completed !== "number"));
  const sessionStatus = createMemo(() => {
    const id = sessionID();
    if (!id) return idle;
    return sync.data?.session_status?.[id] ?? idle;
  });
  const working = createMemo(() => (sessionStatus() ?? idle).type !== "idle");
  const tint = createMemo(() => messageAgentColor(sessionMessages(), sync.data?.agent ?? []));
  const [timeoutDone, setTimeoutDone] = createSignal(true);
  const workingStatus = createMemo(prev => {
    if (working()) return "showing";
    if (prev === "showing" || !timeoutDone()) return "hiding";
    return "hidden";
  });
  createEffect(() => {
    if (workingStatus() !== "hiding") return;
    setTimeoutDone(false);
    makeTimer(() => setTimeoutDone(true), 260, setTimeout);
  });
  const activeMessageID = createMemo(() => {
    const parentID = pending()?.parentID;
    if (parentID) {
      const messages = sessionMessages();
      const result = Binary.search(messages, parentID, message => message.id);
      const message = result.found ? messages[result.index] : messages.find(item => item.id === parentID);
      if (message && message.role === "user") return message.id;
    }
    const status = sessionStatus() ?? idle;
    if (status.type !== "idle") {
      const messages = sessionMessages();
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") return messages[i].id;
      }
    }
    return undefined;
  });
  const info = createMemo(() => {
    const id = sessionID();
    if (!id) return;
    return sync.session.get(id);
  });
  const titleValue = createMemo(() => info()?.title);
  const titleLabel = createMemo(() => sessionTitle(titleValue()));
  const shareUrl = createMemo(() => info()?.share?.url);
  const shareEnabled = createMemo(() => sync.data?.config?.share !== "disabled");
  const parentID = createMemo(() => info()?.parentID);
  const parent = createMemo(() => {
    const id = parentID();
    if (!id) return;
    return sync.session.get(id);
  });
  const parentMessages = createMemo(() => {
    const id = parentID();
    if (!id) return emptyMessages;
    return sync.data?.message?.[id] ?? emptyMessages;
  });
  const parentTitle = createMemo(() => sessionTitle(parent()?.title) ?? language.t("command.session.new"));
  const childTaskDescription = createMemo(() => {
    const id = sessionID();
    if (!id) return;
    return parentMessages().flatMap(message => sync.data?.part?.[message.id] ?? []).map(part => taskDescription(part, id)).findLast(value => !!value);
  });
  const childTitle = createMemo(() => {
    if (!parentID()) return titleLabel() ?? "";
    if (childTaskDescription()) return childTaskDescription();
    const value = titleLabel()?.replace(/\s+\(@[^)]+ subagent\)$/, "");
    if (value) return value;
    return language.t("command.session.new");
  });
  const showHeader = createMemo(() => !!(titleValue() || parentID()));
  const stageCfg = {
    init: 1,
    batch: 3
  };
  const staging = createTimelineStaging({
    sessionKey,
    turnStart: () => props.turnStart,
    messages: () => props.renderedUserMessages,
    config: stageCfg
  });
  const [title, setTitle] = createStore({
    draft: "",
    editing: false,
    menuOpen: false,
    pendingRename: false,
    pendingShare: false
  });
  let titleRef;
  const [share, setShare] = createStore({
    open: false,
    dismiss: null
  });
  const [bar, setBar] = createStore({
    ms: pace(640)
  });
  let more;
  let head;
  createResizeObserver(() => head, () => {
    if (!head || head.clientWidth <= 0) return;
    setBar("ms", pace(head.clientWidth));
  });
  const viewShare = () => {
    const url = shareUrl();
    if (!url) return;
    platform.openLink(url);
  };
  const errorMessage = err => {
    if (err && typeof err === "object" && "data" in err) {
      const data = err.data;
      if (data?.message) return data.message;
    }
    if (err instanceof Error) return err.message;
    return language.t("common.requestFailed");
  };
  const titleMutation = useMutation(() => ({
    mutationFn: input => controller.updateTitle(input.id, input.title),
    onSuccess: (_, input) => {
      sync.set(produce(draft => {
        const index = draft.session.findIndex(s => s.id === input.id);
        if (index !== -1) draft.session[index].title = input.title;
      }));
      setTitle("editing", false);
    },
    onError: err => {
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(err)
      });
    }
  }));
  const shareSession = () => {
    const id = sessionID();
    if (!id || controller.timelineSharePending()) return;
    if (!shareEnabled()) return;
    controller.timelineShare(id);
  };
  const unshareSession = () => {
    const id = sessionID();
    if (!id || controller.timelineUnsharePending()) return;
    if (!shareEnabled()) return;
    controller.timelineUnshare(id);
  };
  createEffect(on(sessionKey, () => setTitle({
    draft: "",
    editing: false,
    menuOpen: false,
    pendingRename: false,
    pendingShare: false
  }), {
    defer: true
  }));
  createEffect(on(() => [parentID(), childTaskDescription()], ([id, description]) => {
    if (!id || description) return;
    if (sync.data?.message?.[id] !== undefined) return;
    void sync.session.sync(id);
  }, {
    defer: true
  }));
  const openTitleEditor = () => {
    if (!sessionID() || parentID()) return;
    setTitle({
      editing: true,
      draft: titleLabel() ?? ""
    });
    requestAnimationFrame(() => {
      titleRef?.focus();
      titleRef?.select();
    });
  };
  const closeTitleEditor = () => {
    if (titleMutation.isPending) return;
    setTitle("editing", false);
  };
  const saveTitleEditor = () => {
    const id = sessionID();
    if (!id) return;
    if (titleMutation.isPending) return;
    const next = title.draft.trim();
    if (!next || next === (titleLabel() ?? "")) {
      setTitle("editing", false);
      return;
    }
    titleMutation.mutate({
      id,
      title: next
    });
  };
  const navigateAfterSessionRemoval = (sessionID, parentID, nextSessionID) => {
    if (params.id !== sessionID) return;
    if (parentID) {
      navigate(`/${params.dir}/session/${parentID}`);
      return;
    }
    if (nextSessionID) {
      navigate(`/${params.dir}/session/${nextSessionID}`);
      return;
    }
    navigate(`/${params.dir}/session`);
  };
  const archiveSession = async sessionID => {
    const session = sync.session.get(sessionID);
    if (!session) return;
    const sessions = sync.data?.session ?? [];
    const index = sessions.findIndex(s => s.id === sessionID);
    const nextSession = index === -1 ? undefined : sessions[index + 1] ?? sessions[index - 1];
    await controller.archiveSession(sessionID).then(() => {
      sync.set(produce(draft => {
        const index = draft.session.findIndex(s => s.id === sessionID);
        if (index !== -1) draft.session.splice(index, 1);
      }));
      navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id);
    }).catch(err => {
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(err)
      });
    });
  };
  const deleteSession = async sessionID => {
    const session = sync.session.get(sessionID);
    if (!session) return false;
    const sessions = (sync.data?.session ?? []).filter(s => !s.parentID && !s.time?.archived);
    const index = sessions.findIndex(s => s.id === sessionID);
    const nextSession = index === -1 ? undefined : sessions[index + 1] ?? sessions[index - 1];
    const result = await controller.deleteSession(sessionID).then(x => x.data).catch(err => {
      showToast({
        title: language.t("session.delete.failed.title"),
        description: errorMessage(err)
      });
      return false;
    });
    if (!result) return false;
    sync.set(produce(draft => {
      const removed = new Set([sessionID]);
      const byParent = new Map();
      for (const item of draft.session) {
        const parentID = item.parentID;
        if (!parentID) continue;
        const existing = byParent.get(parentID);
        if (existing) {
          existing.push(item.id);
          continue;
        }
        byParent.set(parentID, [item.id]);
      }
      const stack = [sessionID];
      while (stack.length) {
        const parentID = stack.pop();
        if (!parentID) continue;
        const children = byParent.get(parentID);
        if (!children) continue;
        for (const child of children) {
          if (removed.has(child)) continue;
          removed.add(child);
          stack.push(child);
        }
      }
      draft.session = draft.session.filter(s => !removed.has(s.id));
    }));
    navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id);
    return true;
  };
  const navigateParent = () => {
    const id = parentID();
    if (!id) return;
    navigate(`/${params.dir}/session/${id}`);
  };
  function DialogDeleteSession(props) {
    const name = createMemo(() => sessionTitle(sync.session.get(props.sessionID)?.title) ?? language.t("command.session.new"));
    const handleDelete = async () => {
      await deleteSession(props.sessionID);
      dialog.close();
    };
    return _$createComponent(Dialog, {
      get title() {
        return language.t("session.delete.title");
      },
      fit: true,
      get children() {
        var _el$ = _tmpl$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.firstChild,
          _el$4 = _el$2.nextSibling;
        _$insert(_el$3, () => language.t("session.delete.confirm", {
          name: name()
        }));
        _$insert(_el$4, _$createComponent(Button, {
          variant: "ghost",
          size: "large",
          onClick: () => dialog.close(),
          get children() {
            return language.t("common.cancel");
          }
        }), null);
        _$insert(_el$4, _$createComponent(Button, {
          variant: "primary",
          size: "large",
          onClick: handleDelete,
          get children() {
            return language.t("session.delete.button");
          }
        }), null);
        return _el$;
      }
    });
  }
  return _$createComponent(Show, {
    get when() {
      return !props.mobileChanges;
    },
    get fallback() {
      return (() => {
        var _el$19 = _tmpl$0();
        _$insert(_el$19, () => props.mobileFallback);
        return _el$19;
      })();
    },
    get children() {
      var _el$5 = _tmpl$9(),
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.firstChild,
        _el$8 = _el$7.firstChild;
      _$addEventListener(_el$7, "click", props.onResumeScroll, true);
      _$insert(_el$8, _$createComponent(Icon, {
        name: "arrow-down-to-line",
        size: "small"
      }));
      _$insert(_el$5, _$createComponent(ScrollView, {
        get viewportRef() {
          return props.setScrollRef;
        },
        onWheel: e => {
          const root = e.currentTarget;
          const delta = normalizeWheelDelta({
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
            rootHeight: root.clientHeight
          });
          if (!delta) return;
          markBoundaryGesture({
            root,
            target: e.target,
            delta,
            onMarkScrollGesture: props.onMarkScrollGesture
          });
        },
        onTouchStart: e => {
          touchGesture = e.touches[0]?.clientY;
        },
        onTouchMove: e => {
          const next = e.touches[0]?.clientY;
          const prev = touchGesture;
          touchGesture = next;
          if (next === undefined || prev === undefined) return;
          const delta = prev - next;
          if (!delta) return;
          const root = e.currentTarget;
          markBoundaryGesture({
            root,
            target: e.target,
            delta,
            onMarkScrollGesture: props.onMarkScrollGesture
          });
        },
        onTouchEnd: () => {
          touchGesture = undefined;
        },
        onTouchCancel: () => {
          touchGesture = undefined;
        },
        onPointerDown: e => {
          if (e.target !== e.currentTarget) return;
          props.onMarkScrollGesture(e.currentTarget);
        },
        onScroll: e => {
          props.onScheduleScrollState(e.currentTarget);
          props.onTurnBackfillScroll();
          if (!props.hasScrollGesture()) return;
          props.onUserScroll();
          props.onAutoScrollHandleScroll();
          props.onMarkScrollGesture(e.currentTarget);
        },
        get onClick() {
          return props.onAutoScrollInteraction;
        },
        "class": "relative min-w-0 w-100 h-full",
        get style() {
          return {
            "--session-title-height": showHeader() ? "40px" : "0px",
            "--sticky-accordion-top": showHeader() ? "48px" : "0px"
          };
        },
        get children() {
          var _el$9 = _tmpl$8(),
            _el$17 = _el$9.firstChild;
          var _ref$ = props.setContentRef;
          typeof _ref$ === "function" ? _$use(_ref$, _el$9) : props.setContentRef = _el$9;
          _$insert(_el$9, _$createComponent(Show, {
            get when() {
              return showHeader();
            },
            get children() {
              var _el$0 = _tmpl$6(),
                _el$10 = _el$0.firstChild,
                _el$11 = _el$10.firstChild,
                _el$12 = _el$11.firstChild,
                _el$15 = _el$12.firstChild;
              _$use(el => {
                head = el;
                setBar("ms", pace(el.clientWidth));
              }, _el$0);
              _$insert(_el$0, _$createComponent(Show, {
                get when() {
                  return _$memo(() => workingStatus() !== "hidden")() && settings.general.showSessionProgressBar();
                },
                get children() {
                  var _el$1 = _tmpl$2();
                  _$effect(_p$ => {
                    var _v$ = workingStatus(),
                      _v$2 = tint() ?? "var(--icon-interactive-base)",
                      _v$3 = `${bar.ms}ms`;
                    _v$ !== _p$.e && _$setAttribute(_el$1, "data-state", _p$.e = _v$);
                    _v$2 !== _p$.t && _$setStyleProperty(_el$1, "--session-progress-color", _p$.t = _v$2);
                    _v$3 !== _p$.a && _$setStyleProperty(_el$1, "--session-progress-ms", _p$.a = _v$3);
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined
                  });
                  return _el$1;
                }
              }), _el$10);
              _$insert(_el$12, _$createComponent(Show, {
                get when() {
                  return parentID();
                },
                get children() {
                  return [(() => {
                    var _el$13 = _tmpl$3();
                    _el$13.$$click = navigateParent;
                    _$insert(_el$13, parentTitle);
                    return _el$13;
                  })(), _tmpl$4()];
                }
              }), _el$15);
              _$insert(_el$15, _$createComponent(Show, {
                get when() {
                  return workingStatus() !== "hidden";
                },
                get children() {
                  var _el$16 = _tmpl$5();
                  _$insert(_el$16, _$createComponent(Spinner, {
                    "class": "size-4",
                    get style() {
                      return {
                        color: tint() ?? "var(--icon-interactive-base)"
                      };
                    }
                  }));
                  _$effect(() => _el$16.classList.toggle("opacity-0", !!(workingStatus() === "hiding")));
                  return _el$16;
                }
              }));
              _$insert(_el$12, _$createComponent(Show, {
                get when() {
                  return childTitle() || title.editing;
                },
                get children() {
                  return _$createComponent(Show, {
                    get when() {
                      return title.editing;
                    },
                    get fallback() {
                      return (() => {
                        var _el$20 = _tmpl$1();
                        _el$20.$$dblclick = openTitleEditor;
                        _$insert(_el$20, childTitle);
                        return _el$20;
                      })();
                    },
                    get children() {
                      return _$createComponent(InlineInput, {
                        ref: el => {
                          titleRef = el;
                        },
                        "data-slot": "session-title-child",
                        get value() {
                          return title.draft;
                        },
                        get disabled() {
                          return titleMutation.isPending;
                        },
                        "class": "fw-medium text-body-emphasis grow-1 min-w-0 rounded-[6px] pl-1 -ml-1",
                        style: {
                          "--inline-input-shadow": "var(--shadow-xs-border-select)"
                        },
                        onInput: event => setTitle("draft", event.currentTarget.value),
                        onKeyDown: event => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveTitleEditor();
                            return;
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeTitleEditor();
                          }
                        },
                        onBlur: closeTitleEditor
                      });
                    }
                  });
                }
              }), null);
              _$insert(_el$10, _$createComponent(Show, {
                get when() {
                  return sessionID();
                },
                keyed: true,
                children: id => (() => {
                  var _el$21 = _tmpl$12();
                  _$insert(_el$21, _$createComponent(SessionContextUsage, {
                    placement: "bottom"
                  }), null);
                  _$insert(_el$21, _$createComponent(Show, {
                    get when() {
                      return !parentID();
                    },
                    get children() {
                      return [_$createComponent(DropdownMenu, {
                        gutter: 4,
                        placement: "bottom-end",
                        get open() {
                          return title.menuOpen;
                        },
                        onOpenChange: open => {
                          setTitle("menuOpen", open);
                          if (open) return;
                        },
                        get children() {
                          return [_$createComponent(DropdownMenu.Trigger, {
                            as: IconButton,
                            icon: "dot-grid",
                            variant: "ghost",
                            "class": "size-6 rounded-2",
                            get classList() {
                              return {};
                            },
                            get ["aria-label"]() {
                              return language.t("common.moreOptions");
                            },
                            get ["aria-expanded"]() {
                              return title.menuOpen || share.open || title.pendingShare;
                            },
                            ref: el => {
                              more = el;
                            }
                          }), _$createComponent(DropdownMenu.Portal, {
                            get children() {
                              return _$createComponent(DropdownMenu.Content, {
                                style: {
                                  "min-width": "104px"
                                },
                                onCloseAutoFocus: event => {
                                  if (title.pendingRename) {
                                    event.preventDefault();
                                    setTitle("pendingRename", false);
                                    openTitleEditor();
                                    return;
                                  }
                                  if (title.pendingShare) {
                                    event.preventDefault();
                                    requestAnimationFrame(() => {
                                      setShare({
                                        open: true,
                                        dismiss: null
                                      });
                                      setTitle("pendingShare", false);
                                    });
                                  }
                                },
                                get children() {
                                  return [_$createComponent(DropdownMenu.Item, {
                                    onSelect: () => {
                                      setTitle("pendingRename", true);
                                      setTitle("menuOpen", false);
                                    },
                                    get children() {
                                      return _$createComponent(DropdownMenu.ItemLabel, {
                                        get children() {
                                          return language.t("common.rename");
                                        }
                                      });
                                    }
                                  }), _$createComponent(Show, {
                                    get when() {
                                      return shareEnabled();
                                    },
                                    get children() {
                                      return _$createComponent(DropdownMenu.Item, {
                                        onSelect: () => {
                                          setTitle({
                                            pendingShare: true,
                                            menuOpen: false
                                          });
                                        },
                                        get children() {
                                          return _$createComponent(DropdownMenu.ItemLabel, {
                                            get children() {
                                              return language.t("session.share.action.share");
                                            }
                                          });
                                        }
                                      });
                                    }
                                  }), _$createComponent(DropdownMenu.Item, {
                                    onSelect: () => void archiveSession(id),
                                    get children() {
                                      return _$createComponent(DropdownMenu.ItemLabel, {
                                        get children() {
                                          return language.t("common.archive");
                                        }
                                      });
                                    }
                                  }), _$createComponent(DropdownMenu.Separator, {}), _$createComponent(DropdownMenu.Item, {
                                    onSelect: () => dialog.show(() => _$createComponent(DialogDeleteSession, {
                                      sessionID: id
                                    })),
                                    get children() {
                                      return _$createComponent(DropdownMenu.ItemLabel, {
                                        get children() {
                                          return language.t("common.delete");
                                        }
                                      });
                                    }
                                  })];
                                }
                              });
                            }
                          })];
                        }
                      }), _$createComponent(KobaltePopover, {
                        get open() {
                          return share.open;
                        },
                        anchorRef: () => more,
                        placement: "bottom-end",
                        gutter: 4,
                        modal: false,
                        onOpenChange: open => {
                          if (open) setShare("dismiss", null);
                          setShare("open", open);
                        },
                        get children() {
                          return _$createComponent(KobaltePopover.Portal, {
                            get children() {
                              return _$createComponent(KobaltePopover.Content, {
                                "data-component": "popover-content",
                                style: {
                                  "min-width": "320px"
                                },
                                onEscapeKeyDown: event => {
                                  setShare({
                                    dismiss: "escape",
                                    open: false
                                  });
                                  event.preventDefault();
                                  event.stopPropagation();
                                },
                                onPointerDownOutside: () => {
                                  setShare({
                                    dismiss: "outside",
                                    open: false
                                  });
                                },
                                onFocusOutside: () => {
                                  setShare({
                                    dismiss: "outside",
                                    open: false
                                  });
                                },
                                onCloseAutoFocus: event => {
                                  if (share.dismiss === "outside") event.preventDefault();
                                  setShare("dismiss", null);
                                },
                                get children() {
                                  var _el$22 = _tmpl$11(),
                                    _el$23 = _el$22.firstChild,
                                    _el$24 = _el$23.firstChild,
                                    _el$25 = _el$24.nextSibling,
                                    _el$26 = _el$23.nextSibling;
                                  _$insert(_el$24, () => language.t("session.share.popover.title"));
                                  _$insert(_el$25, (() => {
                                    var _c$ = _$memo(() => !!shareUrl());
                                    return () => _c$() ? language.t("session.share.popover.description.shared") : language.t("session.share.popover.description.unshared");
                                  })());
                                  _$insert(_el$26, _$createComponent(Show, {
                                    get when() {
                                      return shareUrl();
                                    },
                                    get fallback() {
                                      return _$createComponent(Button, {
                                        size: "large",
                                        variant: "primary",
                                        "class": "w-100",
                                        onClick: shareSession,
                                        get disabled() {
                                          return controller.timelineSharePending();
                                        },
                                        get children() {
                                          return _$memo(() => !!controller.timelineSharePending())() ? language.t("session.share.action.publishing") : language.t("session.share.action.publish");
                                        }
                                      });
                                    },
                                    get children() {
                                      var _el$27 = _tmpl$10(),
                                        _el$28 = _el$27.firstChild;
                                      _$insert(_el$27, _$createComponent(TextField, {
                                        get value() {
                                          return shareUrl() ?? "";
                                        },
                                        readOnly: true,
                                        copyable: true,
                                        copyKind: "link",
                                        tabIndex: -1,
                                        "class": "w-100"
                                      }), _el$28);
                                      _$insert(_el$28, _$createComponent(Button, {
                                        size: "large",
                                        variant: "secondary",
                                        "class": "w-100 shadow-none border",
                                        onClick: unshareSession,
                                        get disabled() {
                                          return controller.timelineUnsharePending();
                                        },
                                        get children() {
                                          return _$memo(() => !!controller.timelineUnsharePending())() ? language.t("session.share.action.unpublishing") : language.t("session.share.action.unpublish");
                                        }
                                      }), null);
                                      _$insert(_el$28, _$createComponent(Button, {
                                        size: "large",
                                        variant: "primary",
                                        "class": "w-100",
                                        onClick: viewShare,
                                        get disabled() {
                                          return controller.timelineUnsharePending();
                                        },
                                        get children() {
                                          return language.t("session.share.action.view");
                                        }
                                      }), null);
                                      return _el$27;
                                    }
                                  }));
                                  return _el$22;
                                }
                              });
                            }
                          });
                        }
                      })];
                    }
                  }), null);
                  return _el$21;
                })()
              }), null);
              _$effect(_p$ => {
                var _v$4 = {
                    "sticky top-0 z-30 bg-[linear-gradient(to_bottom,var(--background-stronger)_48px,transparent)]": true,
                    relative: true,
                    "w-100": true,
                    "pb-4": true,
                    "pl-2 pr-3 md:pl-4 md:pr-3": true,
                    "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered
                  },
                  _v$5 = working() ? "16px" : "0px",
                  _v$6 = working() ? "8px" : "0px";
                _p$.e = _$classList(_el$0, _v$4, _p$.e);
                _v$5 !== _p$.t && _$setStyleProperty(_el$15, "width", _p$.t = _v$5);
                _v$6 !== _p$.a && _$setStyleProperty(_el$15, "margin-right", _p$.a = _v$6);
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined
              });
              return _el$0;
            }
          }), _el$17);
          _$insert(_el$17, _$createComponent(Show, {
            get when() {
              return props.turnStart > 0 || props.historyMore;
            },
            get children() {
              var _el$18 = _tmpl$7();
              _$insert(_el$18, _$createComponent(Button, {
                variant: "ghost",
                size: "large",
                "class": "small fw-medium opacity-50",
                get disabled() {
                  return props.historyLoading;
                },
                get onClick() {
                  return props.onLoadEarlier;
                },
                get children() {
                  return _$memo(() => !!props.historyLoading)() ? language.t("session.messages.loadingEarlier") : language.t("session.messages.loadEarlier");
                }
              }));
              return _el$18;
            }
          }), null);
          _$insert(_el$17, _$createComponent(For, {
            get each() {
              return rendered();
            },
            children: messageID => {
              const active = createMemo(() => activeMessageID() === messageID);
              const comments = createMemo(() => messageComments(sync.data?.part?.[messageID] ?? []), [], {
                equals: (a, b) => a.length === b.length && a.every((c, i) => c.path === b[i].path && c.comment === b[i].comment && c.selection?.startLine === b[i].selection?.startLine && c.selection?.endLine === b[i].selection?.endLine)
              });
              const commentCount = createMemo(() => comments().length);
              return (() => {
                var _el$29 = _tmpl$14();
                _$setAttribute(_el$29, "data-message-id", messageID);
                _$insert(_el$29, _$createComponent(Show, {
                  get when() {
                    return commentCount() > 0;
                  },
                  get children() {
                    var _el$30 = _tmpl$13(),
                      _el$31 = _el$30.firstChild,
                      _el$32 = _el$31.firstChild;
                    _$insert(_el$32, _$createComponent(Index, {
                      get each() {
                        return comments();
                      },
                      children: commentAccessor => {
                        const comment = createMemo(() => commentAccessor());
                        return _$createComponent(Show, {
                          get when() {
                            return comment();
                          },
                          children: c => (() => {
                            var _el$33 = _tmpl$15(),
                              _el$34 = _el$33.firstChild,
                              _el$35 = _el$34.firstChild,
                              _el$36 = _el$34.nextSibling;
                            _$insert(_el$34, _$createComponent(FileIcon, {
                              get node() {
                                return {
                                  path: c().path,
                                  type: "file"
                                };
                              },
                              "class": "size-3.5 shrink-0"
                            }), _el$35);
                            _$insert(_el$35, () => getFilename(c().path));
                            _$insert(_el$34, _$createComponent(Show, {
                              get when() {
                                return c().selection;
                              },
                              children: selection => (() => {
                                var _el$37 = _tmpl$16();
                                _$insert(_el$37, (() => {
                                  var _c$2 = _$memo(() => selection().startLine === selection().endLine);
                                  return () => _c$2() ? `:${selection().startLine}` : `:${selection().startLine}-${selection().endLine}`;
                                })());
                                return _el$37;
                              })()
                            }), null);
                            _$insert(_el$36, () => c().comment);
                            return _el$33;
                          })()
                        });
                      }
                    }));
                    return _el$30;
                  }
                }), null);
                _$insert(_el$29, _$createComponent(SessionTurn, {
                  get sessionID() {
                    return sessionID() ?? "";
                  },
                  messageID: messageID,
                  get messages() {
                    return sessionMessages();
                  },
                  get actions() {
                    return props.actions;
                  },
                  get active() {
                    return active();
                  },
                  get status() {
                    return _$memo(() => !!active())() ? sessionStatus() : undefined;
                  },
                  get showReasoningSummaries() {
                    return settings.general.showReasoningSummaries();
                  },
                  get shellToolDefaultOpen() {
                    return settings.general.shellToolPartsExpanded();
                  },
                  get editToolDefaultOpen() {
                    return settings.general.editToolPartsExpanded();
                  },
                  classes: {
                    root: "min-w-0 w-100 relative",
                    content: "d-flex flex-column justify-content-between !overflow-visible",
                    container: "w-100 px-4 md:px-5"
                  }
                }), null);
                _$effect(_p$ => {
                  var _v$7 = props.anchor(messageID),
                    _v$8 = {
                      "min-w-0 w-100 max-w-full": true,
                      "md:max-w-200 2xl:max-w-[1000px]": props.centered
                    },
                    _v$9 = active() ? undefined : "auto",
                    _v$0 = active() ? undefined : "auto 500px";
                  _v$7 !== _p$.e && _$setAttribute(_el$29, "id", _p$.e = _v$7);
                  _p$.t = _$classList(_el$29, _v$8, _p$.t);
                  _v$9 !== _p$.a && _$setStyleProperty(_el$29, "content-visibility", _p$.a = _v$9);
                  _v$0 !== _p$.o && _$setStyleProperty(_el$29, "contain-intrinsic-size", _p$.o = _v$0);
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined
                });
                return _el$29;
              })();
            }
          }), null);
          _$effect(_$p => _$classList(_el$17, {
            "w-100": true,
            "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
            "mt-0.5": props.centered,
            "mt-0": !props.centered
          }, _$p));
          return _el$9;
        }
      }), null);
      _$effect(_$p => _$classList(_el$6, {
        "opacity-100 translate-y-0 scale-100": props.scroll.overflow && props.scroll.jump && !staging.isStaging(),
        "opacity-0 translate-y-2 scale-95 pointer-events-none": !props.scroll.overflow || !props.scroll.jump || staging.isStaging()
      }, _$p));
      return _el$5;
    }
  });
}
_$delegateEvents(["click", "dblclick"]);