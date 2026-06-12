import { Show, createComponent, createEffect, createMemo, createRenderEffect } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { Tabs } from "@/bs/tabs.js";
import { IconButton } from "@/bs/icon-button.js";
import { TooltipKeybind } from "@/bs/tooltip.js";
import { SessionContextUsage } from "@/components/session-context-usage.js";
import { SessionContextTab } from "@/components/session/index.js";
import { useCommand } from "@/context/command.js";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { createSessionTabs } from "@/pages/session/helpers.js";
import { setSessionHandoff } from "@/pages/session/handoff.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Width-transition utility classes toggled together: a single (space-separated)
// classList key in the compiled output.
const TRANSITION_CLASSES = ["transition-[width]", "duration-[240ms]", "ease-[cubic-bezier(0.22,1,0.36,1)]", "will-change-[width]", "motion-reduce:transition-none"];

export function SessionSidePanel(props) {
  const layout = useLayout();
  const file = useFile();
  const language = useLanguage();
  const command = useCommand();
  const {
    sessionKey,
    tabs,
    view
  } = useSessionLayout();
  const isDesktop = createMediaQuery("(min-width: 768px)");
  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened());
  const reviewTab = createMemo(() => isDesktop());
  const panelWidth = createMemo(() => {
    if (!reviewOpen()) return "0px";
    // Right review panel is a fixed, resizable column (~left explorer width);
    // the center editor flexes to fill the remaining row space.
    return `${layout.session.width()}px`;
  });
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: tab => tab.startsWith("file://") ? file.tab(tab) : tab,
    review: reviewTab,
    hasReview: props.canReview
  });
  const contextOpen = tabState.contextOpen;
  const activeTab = tabState.activeTab;
  // Right panel shows review or context — file tabs are handled in center
  const rightPanelTab = createMemo(() => {
    const at = activeTab();
    if (at === "context") return "context";
    if (at === "review") return "review";
    if (reviewTab() && props.canReview()) return "review";
    return "empty";
  });
  createEffect(() => {
    if (!file.ready()) return;
    setSessionHandoff(sessionKey(), {
      files: tabs().all().reduce((acc, tab) => {
        const path = file.pathFromTab(tab);
        if (!path) return acc;
        const selected = file.selectedLines(path);
        acc[path] = selected && typeof selected === "object" && "start" in selected && "end" in selected ? selected : null;
        return acc;
      }, {})
    });
  });
  return createComponent(Show, {
    get when() {
      return isDesktop();
    },
    get children() {
      // Static skeleton (_tmpl$0):
      //   <aside id=review-panel>          (root: width/aria/inert effect target)
      //     <div .border-l>                (frame)
      //       <div .flex-1>                (inner: aria/inert effect target)
      //         <div .size-full>           (tabsHost)
      const root = template(`<aside id="review-panel" class="relative min-w-0 h-100 d-flex shrink-0 overflow-hidden bg-body"><div class="size-full d-flex border-l border"><div class="relative min-w-0 h-100 flex-1 overflow-hidden bg-body"><div class="size-full min-w-0 h-100 bg-body"></div></div></div></aside>`);
      const frame = root.firstChild;
      const inner = frame.firstChild;
      const tabsHost = inner.firstChild;

      // Close button (static markup verbatim from the original template,
      // including its hardcoded title/aria-label strings). Appended after the
      // frame, matching the compiled insert with a null marker.
      const closeButton = template(`<button type="button" class="btn btn-link btn-sm p-0 px-1 position-absolute text-secondary text-decoration-none bg-body rounded d-inline-flex align-items-center" style="top:7px;right:6px;z-index:6;line-height:1" title="右サイドバーを隠す" aria-label="右サイドバーを隠す"><i class="bi bi-x-lg"></i></button>`);
      closeButton.addEventListener("click", () => view().reviewPanel.close());
      root.appendChild(closeButton);

      // The Tabs root is a plain element; conditional triggers/contents are
      // passed through as <Show> accessors exactly like the compiled output —
      // the bs Tabs components resolve reactive children themselves.
      tabsHost.appendChild(createComponent(Tabs, {
        get value() {
          return rightPanelTab();
        },
        onChange: value => {
          if (value === "review" || value === "context") {
            tabs().setActive(value);
          }
        },
        get children() {
          // Tab bar (_tmpl$6) holding the Tabs.List.
          const tabBar = template(`<div class="sticky top-0 shrink-0 d-flex"></div>`);
          tabBar.appendChild(createComponent(Tabs.List, {
            get children() {
              return [createComponent(Show, {
                get when() {
                  return !!reviewTab() && props.canReview();
                },
                get children() {
                  return createComponent(Tabs.Trigger, {
                    value: "review",
                    get children() {
                      // Live "N changes" label as a SINGLE accessor. The bs
                      // Trigger renders function children via the web insert()
                      // helper without a marker, which replaces the parent's
                      // textContent — sibling text accessors clobber each
                      // other, so the compiled [count, " ", word] array showed
                      // only the word (and only the count after updates).
                      return createMemo(() => `${props.reviewCount()} ${language.t(props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other")}`);
                    }
                  });
                }
              }), createComponent(Show, {
                get when() {
                  return contextOpen();
                },
                get children() {
                  return createComponent(Tabs.Trigger, {
                    value: "context",
                    get closeButton() {
                      return createComponent(TooltipKeybind, {
                        get title() {
                          return language.t("common.closeTab");
                        },
                        get keybind() {
                          return command.keybind("tab.close");
                        },
                        placement: "bottom",
                        gutter: 10,
                        get children() {
                          return createComponent(IconButton, {
                            icon: "close-small",
                            variant: "ghost",
                            class: "h-5 w-5",
                            onClick: () => tabs().close("context"),
                            get ["aria-label"]() {
                              return language.t("common.closeTab");
                            }
                          });
                        }
                      });
                    },
                    hideCloseButton: true,
                    onMiddleClick: () => tabs().close("context"),
                    get children() {
                      // _tmpl$4: usage indicator + live localized tab label.
                      const label = template(`<div class="d-flex align-items-center gap-2"><div></div></div>`);
                      const text = label.firstChild;
                      label.insertBefore(createComponent(SessionContextUsage, {
                        variant: "indicator"
                      }), text);
                      createRenderEffect(() => {
                        text.textContent = language.t("session.tab.context");
                      });
                      return label;
                    }
                  });
                }
              })];
            }
          }));

          return [tabBar, createComponent(Show, {
            get when() {
              return !!reviewTab() && props.canReview();
            },
            get children() {
              return createComponent(Tabs.Content, {
                value: "review",
                class: "d-flex flex-column h-100 overflow-hidden contain-strict",
                get children() {
                  return createComponent(Show, {
                    get when() {
                      return rightPanelTab() === "review";
                    },
                    get children() {
                      return props.reviewPanel();
                    }
                  });
                }
              });
            }
          }), createComponent(Tabs.Content, {
            value: "empty",
            class: "d-flex flex-column h-100 overflow-hidden contain-strict",
            get children() {
              return createComponent(Show, {
                get when() {
                  return rightPanelTab() === "empty";
                },
                get children() {
                  // _tmpl$7: empty-state placeholder with a live localized note.
                  const emptyState = template(`<div class="relative pt-2 flex-1 min-h-0 overflow-hidden"><div class="h-100 px-6 pb-42 -mt-4 d-flex flex-column align-items-center justify-content-center text-center gap-6"><i class="bi bi-file-diff text-secondary opacity-25" style="font-size:3rem"></i><div class="fw-normal text-secondary max-w-56"></div></div></div>`);
                  const note = emptyState.firstChild.firstChild.nextSibling;
                  createRenderEffect(() => {
                    note.textContent = language.t("session.review.noChanges");
                  });
                  return emptyState;
                }
              });
            }
          }), createComponent(Show, {
            get when() {
              return contextOpen();
            },
            get children() {
              return createComponent(Tabs.Content, {
                value: "context",
                class: "d-flex flex-column h-100 overflow-hidden contain-strict",
                get children() {
                  return createComponent(Show, {
                    get when() {
                      return rightPanelTab() === "context";
                    },
                    get children() {
                      // _tmpl$8: context pane wrapper.
                      const pane = template(`<div class="relative pt-2 flex-1 min-h-0 overflow-hidden"></div>`);
                      pane.appendChild(createComponent(SessionContextTab, {}));
                      return pane;
                    }
                  });
                }
              });
            }
          })];
        }
      }));

      // Change-guarded dynamic attributes/classes, like the compiled effect():
      // an unchanged value never re-touches the DOM. All hidden-state writes
      // share one guard because they derive from the same !reviewOpen().
      let prevLabel;
      let prevHidden;
      let prevAnimate;
      let prevWidth;
      createRenderEffect(() => {
        const label = language.t("session.review.change.other");
        const hidden = !reviewOpen();
        const animate = !props.size.active() && !props.reviewSnap;
        const width = panelWidth();
        if (label !== prevLabel) root.setAttribute("aria-label", prevLabel = label);
        if (hidden !== prevHidden) {
          prevHidden = hidden;
          root.setAttribute("aria-hidden", hidden);
          root.inert = hidden;
          root.classList.toggle("pointer-events-none", hidden);
          inner.setAttribute("aria-hidden", hidden);
          inner.inert = hidden;
          inner.classList.toggle("pointer-events-none", hidden);
        }
        if (animate !== prevAnimate) {
          prevAnimate = animate;
          for (const cls of TRANSITION_CLASSES) root.classList.toggle(cls, animate);
        }
        if (width !== prevWidth) root.style.setProperty("width", prevWidth = width);
      });
      return root;
    }
  });
}
