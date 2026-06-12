// Compiled solid-js/web template helpers are replaced with hand-written DOM
// construction. insert() is the established exception for reactive and
// component-valued children (Kobalte presence-gated Popover/Dropdown content,
// runtime Show/For/Index output, memo-accessor returns) so Solid keeps
// reconciling accessors instead of freezing them.
import { insert as _solidInsert } from "solid-js/web";
import { For, createComponent, createEffect, createMemo, createRenderEffect, on, onCleanup, Show, Index, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { useMutation } from "@/lib/query/index.js";
import { useNavigate } from "@/lib/router/index.js";
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
import { Popover as KobaltePopover } from "@/vendor/ui/components/popover.js";
import { shouldMarkBoundaryGesture, normalizeWheelDelta } from "@/pages/session/message-gesture.js";
import { SessionContextUsage } from "@/components/session-context-usage.js";
import { useDialog } from "@/lib/dialog.js";
import { createResizeObserver } from "@/lib/primitives/resize-observer.js";
import { useLanguage } from "@/context/language.js";
import { useSessionKey } from "@/pages/session/session-layout.js";
import { usePlatform } from "@/context/platform.js";
import { useSessionController } from "@/controllers/session.js";
import { useSettings } from "@/context/settings.js";
import { useSync } from "@/context/sync.js";
import { messageAgentColor } from "@/utils/agent.js";
import { sessionTitle } from "@/utils/session-title.js";
import { parseCommentNote, readCommentMetadata } from "@/utils/comment-note.js";
import { makeTimer } from "@/lib/primitives/timer.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated and
// user-provided strings are always assigned via textContent or insert(), never
// interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
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
    return createComponent(Dialog, {
      get title() {
        return language.t("session.delete.title");
      },
      fit: true,
      get children() {
        // _tmpl$: confirm text + footer buttons.
        const body = template(`<div class="d-flex flex-column gap-4 pl-6 pr-2.5 pb-3"><div class="d-flex flex-column gap-1"><span class="text-body-emphasis"></span></div><div class="d-flex justify-content-end gap-2"></div></div>`);
        const confirmEl = body.firstChild.firstChild;
        const footerEl = body.firstChild.nextSibling;
        createRenderEffect(() => {
          confirmEl.textContent = language.t("session.delete.confirm", {
            name: name()
          });
        });
        _solidInsert(footerEl, createComponent(Button, {
          variant: "ghost",
          size: "large",
          onClick: () => dialog.close(),
          get children() {
            return language.t("common.cancel");
          }
        }), null);
        _solidInsert(footerEl, createComponent(Button, {
          variant: "primary",
          size: "large",
          onClick: handleDelete,
          get children() {
            return language.t("session.delete.button");
          }
        }), null);
        return body;
      }
    });
  }
  // ----- Progress strip (Show children, _tmpl$2) -----
  const buildProgressBar = () => {
    const barEl = template(`<div data-component="session-progress" aria-hidden="true"><div data-component="session-progress-bar"></div></div>`);
    // Change-guarded reactive attribute/styles, mirroring the compiled effect.
    let prevState;
    let prevColor;
    let prevMs;
    createRenderEffect(() => {
      const state = workingStatus();
      const color = tint() ?? "var(--icon-interactive-base)";
      const ms = `${bar.ms}ms`;
      if (state !== prevState) barEl.setAttribute("data-state", prevState = state);
      if (color !== prevColor) barEl.style.setProperty("--session-progress-color", prevColor = color);
      if (ms !== prevMs) barEl.style.setProperty("--session-progress-ms", prevMs = ms);
    });
    return barEl;
  };

  // ----- Header actions (keyed Show(sessionID()) children, _tmpl$12) -----
  const buildHeaderActions = id => {
    const actionsEl = template(`<div class="shrink-0 d-flex align-items-center gap-3"></div>`);
    _solidInsert(actionsEl, createComponent(SessionContextUsage, {
      placement: "bottom"
    }), null);
    _solidInsert(actionsEl, createComponent(Show, {
      get when() {
        return !parentID();
      },
      get children() {
        return [createComponent(DropdownMenu, {
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
            return [createComponent(DropdownMenu.Trigger, {
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
            }), createComponent(DropdownMenu.Portal, {
              get children() {
                return createComponent(DropdownMenu.Content, {
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
                    return [createComponent(DropdownMenu.Item, {
                      onSelect: () => {
                        setTitle("pendingRename", true);
                        setTitle("menuOpen", false);
                      },
                      get children() {
                        return createComponent(DropdownMenu.ItemLabel, {
                          get children() {
                            return language.t("common.rename");
                          }
                        });
                      }
                    }), createComponent(Show, {
                      get when() {
                        return shareEnabled();
                      },
                      get children() {
                        return createComponent(DropdownMenu.Item, {
                          onSelect: () => {
                            setTitle({
                              pendingShare: true,
                              menuOpen: false
                            });
                          },
                          get children() {
                            return createComponent(DropdownMenu.ItemLabel, {
                              get children() {
                                return language.t("session.share.action.share");
                              }
                            });
                          }
                        });
                      }
                    }), createComponent(DropdownMenu.Item, {
                      onSelect: () => void archiveSession(id),
                      get children() {
                        return createComponent(DropdownMenu.ItemLabel, {
                          get children() {
                            return language.t("common.archive");
                          }
                        });
                      }
                    }), createComponent(DropdownMenu.Separator, {}), createComponent(DropdownMenu.Item, {
                      onSelect: () => dialog.show(() => createComponent(DialogDeleteSession, {
                        sessionID: id
                      })),
                      get children() {
                        return createComponent(DropdownMenu.ItemLabel, {
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
        }), createComponent(KobaltePopover, {
          get open() {
            return share.open;
          },
          // Anchor-only popover: positioned against the "more" dropdown button,
          // no own trigger. Esc/outside dismissal + flip handled internally; the
          // dismiss reason arrives via onDismiss (was onEscapeKeyDown /
          // onPointerDownOutside / onFocusOutside on Kobalte.Content).
          anchorRef: () => more,
          placement: "bottom-end",
          gutter: 4,
          modal: false,
          contentProps: {
            style: {
              "min-width": "320px"
            }
          },
          onOpenChange: open => {
            if (open) setShare("dismiss", null);
            setShare("open", open);
          },
          onDismiss: reason => {
            setShare("dismiss", reason);
          },
          get children() {
            return () => {
                    // _tmpl$11: share popover body (presence-gated content,
                    // rebuilt per open via the Popover body insert()).
                    if (!share.open) return undefined;
                    const body = template(`<div class="d-flex flex-column p-3"><div class="d-flex flex-column gap-1"><div class="fw-medium text-body-emphasis"></div><div class="small fw-normal text-secondary"></div></div><div class="mt-3 d-flex flex-column gap-2"></div></div>`);
                    const popTitleEl = body.firstChild.firstChild;
                    const popDescEl = popTitleEl.nextSibling;
                    const popActionsEl = body.firstChild.nextSibling;
                    createRenderEffect(() => {
                      popTitleEl.textContent = language.t("session.share.popover.title");
                    });
                    createRenderEffect(() => {
                      popDescEl.textContent = shareUrl() ? language.t("session.share.popover.description.shared") : language.t("session.share.popover.description.unshared");
                    });
                    _solidInsert(popActionsEl, createComponent(Show, {
                      get when() {
                        return shareUrl();
                      },
                      get fallback() {
                        return createComponent(Button, {
                          size: "large",
                          variant: "primary",
                          "class": "w-100",
                          onClick: shareSession,
                          get disabled() {
                            return controller.timelineSharePending();
                          },
                          get children() {
                            return controller.timelineSharePending() ? language.t("session.share.action.publishing") : language.t("session.share.action.publish");
                          }
                        });
                      },
                      get children() {
                        // _tmpl$10: shared-state actions.
                        const grid = template(`<div class="d-flex flex-column gap-2"><div class="grid grid-cols-2 gap-2"></div></div>`);
                        const gridRow = grid.firstChild;
                        _solidInsert(grid, createComponent(TextField, {
                          get value() {
                            return shareUrl() ?? "";
                          },
                          readOnly: true,
                          copyable: true,
                          copyKind: "link",
                          tabIndex: -1,
                          "class": "w-100"
                        }), gridRow);
                        _solidInsert(gridRow, createComponent(Button, {
                          size: "large",
                          variant: "secondary",
                          "class": "w-100 shadow-none border",
                          onClick: unshareSession,
                          get disabled() {
                            return controller.timelineUnsharePending();
                          },
                          get children() {
                            return controller.timelineUnsharePending() ? language.t("session.share.action.unpublishing") : language.t("session.share.action.unpublish");
                          }
                        }), null);
                        _solidInsert(gridRow, createComponent(Button, {
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
                        return grid;
                      }
                    }));
                    return body;
            };
          }
        })];
      }
    }), null);
    return actionsEl;
  };

  // ----- Session header (Show(showHeader()) children, _tmpl$6) -----
  const buildHeader = () => {
    const headerEl = template(`<div data-session-title><div class="h-12 w-100 d-flex align-items-center justify-content-between gap-2"><div class="d-flex align-items-center gap-1 min-w-0 flex-1 pr-3"><div class="d-flex align-items-center min-w-0 grow-1"><div class="shrink-0 d-flex align-items-center justify-content-center overflow-hidden transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" aria-hidden="true"></div></div></div></div></div>`);
    const rowEl = headerEl.firstChild;
    const titleRowEl = rowEl.firstChild.firstChild;
    const spinnerBoxEl = titleRowEl.firstChild;
    // use(): capture the measuring ref and seed the progress pace (the element
    // is detached here, so clientWidth is 0, exactly as in the compiled use()).
    head = headerEl;
    setBar("ms", pace(headerEl.clientWidth));
    // Progress strip, inserted before the title row.
    _solidInsert(headerEl, createComponent(Show, {
      get when() {
        return workingStatus() !== "hidden" && settings.general.showSessionProgressBar();
      },
      get children() {
        return buildProgressBar();
      }
    }), rowEl);
    // Parent session crumb + separator (_tmpl$3/_tmpl$4), before the spinner box.
    _solidInsert(titleRowEl, createComponent(Show, {
      get when() {
        return parentID();
      },
      get children() {
        const parentBtn = template(`<button type="button" data-slot="session-title-parent" class="min-w-0 max-w-[40%] truncate fw-medium text-secondary transition-colors"></button>`);
        // Compiled delegated $$click -> direct listener.
        parentBtn.addEventListener("click", navigateParent);
        createRenderEffect(() => {
          parentBtn.textContent = parentTitle();
        });
        return [parentBtn, template(`<span data-slot="session-title-separator" class="px-2 fw-medium text-secondary" aria-hidden="true">/</span>`)];
      }
    }), spinnerBoxEl);
    // Working spinner (_tmpl$5).
    _solidInsert(spinnerBoxEl, createComponent(Show, {
      get when() {
        return workingStatus() !== "hidden";
      },
      get children() {
        const wrap = template(`<div class="transition-opacity duration-200 ease-out"></div>`);
        _solidInsert(wrap, createComponent(Spinner, {
          "class": "size-4",
          get style() {
            return {
              color: tint() ?? "var(--icon-interactive-base)"
            };
          }
        }));
        createRenderEffect(() => wrap.classList.toggle("opacity-0", !!(workingStatus() === "hiding")));
        return wrap;
      }
    }));
    // Session title: static heading (_tmpl$1) or the inline editor.
    _solidInsert(titleRowEl, createComponent(Show, {
      get when() {
        return childTitle() || title.editing;
      },
      get children() {
        return createComponent(Show, {
          get when() {
            return title.editing;
          },
          get fallback() {
            const heading = template(`<h1 data-slot="session-title-child" class="fw-medium text-body-emphasis truncate grow-1 min-w-0"></h1>`);
            // Compiled delegated $$dblclick -> direct listener.
            heading.addEventListener("dblclick", openTitleEditor);
            createRenderEffect(() => {
              heading.textContent = childTitle() ?? "";
            });
            return heading;
          },
          get children() {
            return createComponent(InlineInput, {
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
    // Header actions, keyed by session id.
    _solidInsert(rowEl, createComponent(Show, {
      get when() {
        return sessionID();
      },
      keyed: true,
      children: id => buildHeaderActions(id)
    }), null);
    // Always-true keys of the compiled classList map applied once.
    headerEl.classList.add("sticky", "top-0", "z-30", "bg-[linear-gradient(to_bottom,var(--background-stronger)_48px,transparent)]", "relative", "w-100", "pb-4", "pl-2", "pr-3", "md:pl-4", "md:pr-3");
    // Change-guarded centered classes + spinner box sizing, mirroring the
    // compiled effect block.
    let prevCentered;
    let prevWidth;
    let prevMargin;
    createRenderEffect(() => {
      const centered = !!props.centered;
      const width = working() ? "16px" : "0px";
      const margin = working() ? "8px" : "0px";
      if (centered !== prevCentered) {
        prevCentered = centered;
        for (const cls of ["md:max-w-200", "md:mx-auto", "2xl:max-w-[1000px]"]) headerEl.classList.toggle(cls, centered);
      }
      if (width !== prevWidth) spinnerBoxEl.style.setProperty("width", prevWidth = width);
      if (margin !== prevMargin) spinnerBoxEl.style.setProperty("margin-right", prevMargin = margin);
    });
    return headerEl;
  };
  // ----- Comment card (Show(comment()) children, _tmpl$15/_tmpl$16) -----
  // c is the derived accessor handed out by the non-keyed Show callback.
  const buildCommentCard = c => {
    const card = template(`<div class="shrink-0 max-w-[260px] rounded-[6px] border bg-body px-2.5 py-2"><div class="d-flex align-items-center gap-1.5 min-w-0 small fw-medium text-body-emphasis"><span class="truncate"></span></div><div class="pt-1 small fw-normal text-body-emphasis whitespace-pre-wrap break-words"></div></div>`);
    const headRowEl = card.firstChild;
    const nameEl = headRowEl.firstChild;
    const bodyEl = headRowEl.nextSibling;
    _solidInsert(headRowEl, createComponent(FileIcon, {
      get node() {
        return {
          path: c().path,
          type: "file"
        };
      },
      "class": "size-3.5 shrink-0"
    }), nameEl);
    createRenderEffect(() => {
      nameEl.textContent = getFilename(c().path);
    });
    _solidInsert(headRowEl, createComponent(Show, {
      get when() {
        return c().selection;
      },
      children: selection => {
        const lines = template(`<span class="shrink-0 text-secondary"></span>`);
        createRenderEffect(() => {
          const sel = selection();
          lines.textContent = sel.startLine === sel.endLine ? `:${sel.startLine}` : `:${sel.startLine}-${sel.endLine}`;
        });
        return lines;
      }
    }), null);
    createRenderEffect(() => {
      bodyEl.textContent = c().comment ?? "";
    });
    return card;
  };

  // ----- Timeline row (For children, _tmpl$14/_tmpl$13) -----
  const buildTimelineRow = messageID => {
    const active = createMemo(() => activeMessageID() === messageID);
    const comments = createMemo(() => messageComments(sync.data?.part?.[messageID] ?? []), [], {
      equals: (a, b) => a.length === b.length && a.every((c, i) => c.path === b[i].path && c.comment === b[i].comment && c.selection?.startLine === b[i].selection?.startLine && c.selection?.endLine === b[i].selection?.endLine)
    });
    const commentCount = createMemo(() => comments().length);
    const row = template(`<div></div>`);
    row.setAttribute("data-message-id", messageID);
    _solidInsert(row, createComponent(Show, {
      get when() {
        return commentCount() > 0;
      },
      get children() {
        // _tmpl$13: right-aligned comment strip above the turn.
        const strip = template(`<div class="w-100 px-4 md:px-5 pb-2"><div class="ml-auto max-w-[82%] overflow-x-auto no-scrollbar"><div class="d-flex w-max min-w-full justify-content-end gap-2"></div></div></div>`);
        const stripRow = strip.firstChild.firstChild;
        // Runtime Index reuses card slots per position while comments() only
        // changes identity on real content changes (custom equals above).
        _solidInsert(stripRow, createComponent(Index, {
          get each() {
            return comments();
          },
          children: commentAccessor => {
            const comment = createMemo(() => commentAccessor());
            return createComponent(Show, {
              get when() {
                return comment();
              },
              children: c => buildCommentCard(c)
            });
          }
        }));
        return strip;
      }
    }), null);
    _solidInsert(row, createComponent(SessionTurn, {
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
        return active() ? sessionStatus() : undefined;
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
    // Always-true keys of the compiled classList map applied once; anchor id,
    // centered classes and content-visibility stay change-guarded like the
    // compiled effect block.
    row.classList.add("min-w-0", "w-100", "max-w-full");
    let prevAnchor;
    let prevCentered;
    let prevVisibility;
    let prevIntrinsic;
    createRenderEffect(() => {
      const anchor = props.anchor(messageID);
      const centered = !!props.centered;
      const visibility = active() ? undefined : "auto";
      const intrinsic = active() ? undefined : "auto 500px";
      if (anchor !== prevAnchor) {
        prevAnchor = anchor;
        if (anchor == null) row.removeAttribute("id");
        else row.setAttribute("id", anchor);
      }
      if (centered !== prevCentered) {
        prevCentered = centered;
        row.classList.toggle("md:max-w-200", centered);
        row.classList.toggle("2xl:max-w-[1000px]", centered);
      }
      if (visibility !== prevVisibility) {
        prevVisibility = visibility;
        if (visibility == null) row.style.removeProperty("content-visibility");
        else row.style.setProperty("content-visibility", visibility);
      }
      if (intrinsic !== prevIntrinsic) {
        prevIntrinsic = intrinsic;
        if (intrinsic == null) row.style.removeProperty("contain-intrinsic-size");
        else row.style.setProperty("contain-intrinsic-size", intrinsic);
      }
    });
    return row;
  };

  // ----- Scroll content (ScrollView children, _tmpl$8) -----
  const buildTimelineContent = () => {
    const contentEl = template(`<div class="min-w-0 w-100"><div role="log" data-slot="session-turn-list" class="d-flex flex-column align-items-start justify-content-start pb-16 transition-[margin]"></div></div>`);
    const turnListEl = contentEl.firstChild;
    // Ref binding, mirroring the compiled use() dual branch.
    const contentRef = props.setContentRef;
    if (typeof contentRef === "function") contentRef(contentEl);
    else props.setContentRef = contentEl;
    _solidInsert(contentEl, createComponent(Show, {
      get when() {
        return showHeader();
      },
      get children() {
        return buildHeader();
      }
    }), turnListEl);
    // Load-earlier control (_tmpl$7).
    _solidInsert(turnListEl, createComponent(Show, {
      get when() {
        return props.turnStart > 0 || props.historyMore;
      },
      get children() {
        const wrap = template(`<div class="w-100 d-flex justify-content-center"></div>`);
        _solidInsert(wrap, createComponent(Button, {
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
            return props.historyLoading ? language.t("session.messages.loadingEarlier") : language.t("session.messages.loadEarlier");
          }
        }));
        return wrap;
      }
    }), null);
    // Runtime For keeps row nodes keyed by message id, so turns (and their
    // content-visibility state) are reused across sync updates even though
    // rendered() returns a fresh array identity each time.
    _solidInsert(turnListEl, createComponent(For, {
      get each() {
        return rendered();
      },
      children: messageID => buildTimelineRow(messageID)
    }), null);
    // Always-true key applied once; centered margins stay change-guarded.
    turnListEl.classList.add("w-100");
    let prevCentered;
    createRenderEffect(() => {
      const centered = !!props.centered;
      if (centered === prevCentered) return;
      prevCentered = centered;
      for (const cls of ["md:max-w-200", "md:mx-auto", "2xl:max-w-[1000px]"]) turnListEl.classList.toggle(cls, centered);
      turnListEl.classList.toggle("mt-0.5", centered);
      turnListEl.classList.toggle("mt-0", !centered);
    });
    return contentEl;
  };

  // ----- Timeline root (Show children, _tmpl$9) -----
  const buildTimeline = () => {
    const rootEl = template(`<div class="relative w-full h-full min-w-0"><div class="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60] pointer-events-none transition-all duration-200 ease-out"><button class="pointer-events-auto d-flex align-items-center justify-content-center w-10 h-8 bg-transparent border-none cursor-pointer p-0 group"><div class="d-flex align-items-center justify-content-center w-8 h-6 rounded-[6px] border bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] backdrop-blur-[0.75px] transition-colors group-hover:border-[var(--border-weak-base)] group-hover:[--icon-base:var(--icon-hover)]" style="box-shadow:0 51px 60px 0 rgba(0,0,0,0.10), 0 15px 18px 0 rgba(0,0,0,0.12), 0 6.386px 7.513px 0 rgba(0,0,0,0.12), 0 2.31px 2.717px 0 rgba(0,0,0,0.20)"></div></button></div></div>`);
    const jumpEl = rootEl.firstChild;
    const jumpBtn = jumpEl.firstChild;
    const jumpIconBox = jumpBtn.firstChild;
    // Compiled delegated $$click -> direct listener (handler read once at
    // creation, exactly like the compiled addEventListener).
    jumpBtn.addEventListener("click", props.onResumeScroll);
    _solidInsert(jumpIconBox, createComponent(Icon, {
      name: "arrow-down-to-line",
      size: "small"
    }));
    _solidInsert(rootEl, createComponent(ScrollView, {
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
        return buildTimelineContent();
      }
    }), null);
    // Jump button visibility classes, change-guarded on the resolved state
    // (the compiled classList keys are exact complements of each other).
    let prevVisible;
    createRenderEffect(() => {
      const visible = !!(props.scroll.overflow && props.scroll.jump && !staging.isStaging());
      if (visible === prevVisible) return;
      prevVisible = visible;
      for (const cls of ["opacity-100", "translate-y-0", "scale-100"]) jumpEl.classList.toggle(cls, visible);
      for (const cls of ["opacity-0", "translate-y-2", "scale-95", "pointer-events-none"]) jumpEl.classList.toggle(cls, !visible);
    });
    return rootEl;
  };
  return createComponent(Show, {
    get when() {
      return !props.mobileChanges;
    },
    get fallback() {
      // _tmpl$0: mobile fallback host; the forwarded child stays reactive
      // through insert().
      const fallbackEl = template(`<div class="relative h-full overflow-hidden"></div>`);
      _solidInsert(fallbackEl, () => props.mobileFallback);
      return fallbackEl;
    },
    get children() {
      return buildTimeline();
    }
  });
}
