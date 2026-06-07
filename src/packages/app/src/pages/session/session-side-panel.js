import { template as _$template } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><div>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="sticky top-0 shrink-0 d-flex">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="relative pt-2 flex-1 min-h-0 overflow-hidden"><div class="h-100 px-6 pb-42 -mt-4 d-flex flex-column align-items-center justify-content-center text-center gap-6"><i class="bi bi-file-diff text-secondary opacity-25"style=font-size:3rem></i><div class="fw-normal text-secondary max-w-56">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="relative pt-2 flex-1 min-h-0 overflow-hidden">`),
  _tmpl$0 = /*#__PURE__*/_$template(`<aside id=review-panel class="relative min-w-0 h-100 d-flex shrink-0 overflow-hidden bg-body"><div class="size-full d-flex border-l border"><div class="relative min-w-0 h-100 flex-1 overflow-hidden bg-body"><div class="size-full min-w-0 h-100 bg-body">`),
  _tmplCloseR = /*#__PURE__*/_$template(`<button type=button class="btn btn-link btn-sm p-0 px-1 position-absolute text-secondary text-decoration-none bg-body rounded d-inline-flex align-items-center" style="top:7px;right:6px;z-index:6;line-height:1" title="右サイドバーを隠す" aria-label="右サイドバーを隠す"><i class="bi bi-x-lg"></i></button>`);
import { Show, createEffect, createMemo, onCleanup } from "solid-js";
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
  return _$createComponent(Show, {
    get when() {
      return isDesktop();
    },
    get children() {
      var _el$5 = _tmpl$0(),
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.firstChild,
        _el$8 = _el$7.firstChild;
      var _closeR = _tmplCloseR();
      _closeR.addEventListener("click", () => view().reviewPanel.close());
      _$insert(_el$5, _closeR, null);
      _$insert(_el$8, _$createComponent(Tabs, {
        get value() {
          return rightPanelTab();
        },
        onChange: value => {
          if (value === "review" || value === "context") {
            tabs().setActive(value);
          }
        },
        get children() {
          return [(() => {
            var _el$9 = _tmpl$6();
            _$insert(_el$9, _$createComponent(Tabs.List, {
              get children() {
                return [_$createComponent(Show, {
                  get when() {
                    return _$memo(() => !!reviewTab())() && props.canReview();
                  },
                  get children() {
                    return _$createComponent(Tabs.Trigger, {
                      value: "review",
                      get children() {
                        return [_$memo(() => props.reviewCount()), " ", _$memo(() => language.t(props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other"))];
                      }
                    });
                  }
                }), _$createComponent(Show, {
                  get when() {
                    return contextOpen();
                  },
                  get children() {
                    return _$createComponent(Tabs.Trigger, {
                      value: "context",
                      get closeButton() {
                        return _$createComponent(TooltipKeybind, {
                          get title() {
                            return language.t("common.closeTab");
                          },
                          get keybind() {
                            return command.keybind("tab.close");
                          },
                          placement: "bottom",
                          gutter: 10,
                          get children() {
                            return _$createComponent(IconButton, {
                              icon: "close-small",
                              variant: "ghost",
                              "class": "h-5 w-5",
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
                        var _el$11 = _tmpl$4(),
                          _el$12 = _el$11.firstChild;
                        _$insert(_el$11, _$createComponent(SessionContextUsage, {
                          variant: "indicator"
                        }), _el$12);
                        _$insert(_el$12, () => language.t("session.tab.context"));
                        return _el$11;
                      }
                    });
                  }
                })];
              }
            }));
            return _el$9;
          })(), _$createComponent(Show, {
            get when() {
              return _$memo(() => !!reviewTab())() && props.canReview();
            },
            get children() {
              return _$createComponent(Tabs.Content, {
                value: "review",
                "class": "d-flex flex-column h-100 overflow-hidden contain-strict",
                get children() {
                  return _$createComponent(Show, {
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
          }), _$createComponent(Tabs.Content, {
            value: "empty",
            "class": "d-flex flex-column h-100 overflow-hidden contain-strict",
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return rightPanelTab() === "empty";
                },
                get children() {
                  var _el$14 = _tmpl$7(),
                    _el$15 = _el$14.firstChild,
                    _el$16 = _el$15.firstChild.nextSibling;
                  _$insert(_el$16, () => language.t("session.review.noChanges"));
                  return _el$14;
                }
              });
            }
          }), _$createComponent(Show, {
            get when() {
              return contextOpen();
            },
            get children() {
              return _$createComponent(Tabs.Content, {
                value: "context",
                "class": "d-flex flex-column h-100 overflow-hidden contain-strict",
                get children() {
                  return _$createComponent(Show, {
                    get when() {
                      return rightPanelTab() === "context";
                    },
                    get children() {
                      var _el$17 = _tmpl$8();
                      _$insert(_el$17, _$createComponent(SessionContextTab, {}));
                      return _el$17;
                    }
                  });
                }
              });
            }
          })];
        }
      }));
      _$effect(_p$ => {
        var _v$6 = language.t("session.review.change.other"),
          _v$7 = !reviewOpen(),
          _v$8 = !reviewOpen(),
          _v$9 = {
            "pointer-events-none": !reviewOpen(),
            "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none": !props.size.active() && !props.reviewSnap
          },
          _v$0 = panelWidth(),
          _v$1 = !reviewOpen(),
          _v$10 = !reviewOpen(),
          _v$11 = !reviewOpen();
        _v$6 !== _p$.e && _$setAttribute(_el$5, "aria-label", _p$.e = _v$6);
        _v$7 !== _p$.t && _$setAttribute(_el$5, "aria-hidden", _p$.t = _v$7);
        _v$8 !== _p$.a && (_el$5.inert = _p$.a = _v$8);
        _p$.o = _$classList(_el$5, _v$9, _p$.o);
        _v$0 !== _p$.i && _$setStyleProperty(_el$5, "width", _p$.i = _v$0);
        _v$1 !== _p$.n && _$setAttribute(_el$7, "aria-hidden", _p$.n = _v$1);
        _v$10 !== _p$.s && (_el$7.inert = _p$.s = _v$10);
        _v$11 !== _p$.h && _el$7.classList.toggle("pointer-events-none", _p$.h = _v$11);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined,
        h: undefined
      });
      return _el$5;
    }
  });
}
