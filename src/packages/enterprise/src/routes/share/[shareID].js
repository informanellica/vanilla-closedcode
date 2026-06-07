import { template as _$template } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="min-h-screen w-full bg-background-base text-text-base flex flex-col items-center justify-center gap-4 p-6 text-center"><p class=text-16-medium>Unable to render this share.</p><p class="text-14-regular text-text-weaker">Check the console for more details.</p><pre class="text-12-mono text-left whitespace-pre-wrap break-words w-full max-w-200 bg-background-stronger rounded-md p-4">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="flex flex-col gap-4"><div class="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:h-8 justify-start self-stretch"><div class="pl-[2.5px] pr-2 flex items-center gap-1.75 bg-surface-strong shadow-xs-border-base w-fit"><div class="text-12-mono text-text-base">v</div></div><div class="flex gap-4 items-center"><div class="flex gap-2 items-center"><div class="text-12-regular text-text-base"></div></div><div class="text-12-regular text-text-weaker"></div></div></div><div class="text-left text-16-medium text-text-strong">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="relative mt-2 pb-8 min-w-0 w-full h-full overflow-y-auto no-scrollbar"><div class="px-4 py-6"></div><div class="flex flex-col gap-15 items-start justify-start mt-4"></div><div class="px-4 flex items-center justify-center pt-20 pb-8 shrink-0">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="@container relative grow pt-14 flex-1 min-h-0 border-l border-border-weak-base">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="relative h-full pt-8 overflow-y-auto no-scrollbar">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="relative bg-background-stronger w-screen h-screen overflow-hidden flex flex-col"><header class="h-12 px-6 py-2 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base"><div class><a href=https://github.com/informanellica/vanilla-closedcode></a></div><div class="flex gap-3 items-center"></div></header><div class="select-text flex flex-col flex-1 min-h-0"><div><div><div></div><div class="flex items-start justify-start h-full min-h-0">`);
import { SessionTurn } from "ui/session-turn";
import { SessionReview } from "ui/session-review";
import { DataProvider } from "ui/context";
import { FileComponentProvider } from "ui/context/file";
import { WorkerPoolProvider } from "ui/context/worker-pool";
import { createAsync, query, useParams } from "@solidjs/router";
import { createMemo, createSignal, ErrorBoundary, For, Match, Show, Switch } from "solid-js";
import { Share } from "~/core/share";
import { Logo, Mark } from "ui/logo";
import { IconButton } from "ui/icon-button";
import { ProviderIcon } from "ui/provider-icon";
import { iife } from "core/util/iife";
import { Binary } from "core/util/binary";
import { NamedError } from "core/util/error";
import { DateTime } from "luxon";
import { createStore } from "solid-js/store";
import z from "zod";
import NotFound from "../[...404].js";
import { Tabs } from "ui/tabs";
import { MessageNav } from "ui/message-nav";
import { FileSSR } from "ui/file-ssr";
import { clientOnly } from "@solidjs/start";
import { Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "solid-js/web";
const ClientOnlyWorkerPoolProvider = clientOnly(() => import("ui/pierre/worker").then(m => ({
  default: props => _$createComponent(WorkerPoolProvider, {
    get pools() {
      return m.getWorkerPools();
    },
    get children() {
      return props.children;
    }
  })
})));
const SessionDataMissingError = NamedError.create("SessionDataMissingError", z.object({
  sessionID: z.string(),
  message: z.string().optional()
}));
const getData = query(async shareID => {
  "use server";

  const share = await Share.get(shareID);
  if (!share) throw new SessionDataMissingError({
    sessionID: shareID
  });
  const data = await Share.data(shareID);
  const result = {
    sessionID: share.sessionID,
    shareID,
    session: [],
    session_diff: {
      [share.sessionID]: []
    },
    session_status: {
      [share.sessionID]: {
        type: "idle"
      }
    },
    message: {},
    part: {},
    model: {}
  };
  for (const item of data) {
    switch (item.type) {
      case "session":
        result.session.push(item.data);
        break;
      case "session_diff":
        result.session_diff[share.sessionID] = item.data;
        break;
      case "message":
        result.message[item.data.sessionID] = result.message[item.data.sessionID] ?? [];
        result.message[item.data.sessionID].push(item.data);
        break;
      case "part":
        result.part[item.data.messageID] = result.part[item.data.messageID] ?? [];
        result.part[item.data.messageID].push(item.data);
        break;
      case "model":
        result.model[share.sessionID] = item.data;
        break;
    }
  }
  const match = Binary.search(result.session, share.sessionID, s => s.id);
  if (!match.found) throw new SessionDataMissingError({
    sessionID: share.sessionID
  });
  return result;
}, "getShareData");
export default function () {
  getRequestEvent()?.response.headers.set("Cache-Control", "public, max-age=30, s-maxage=300, stale-while-revalidate=86400");
  const params = useParams();
  const data = createAsync(async () => {
    if (!params.shareID) throw new Error("Missing shareID");
    return getData(params.shareID);
  });
  return _$createComponent(ErrorBoundary, {
    fallback: error => {
      if (SessionDataMissingError.isInstance(error)) {
        return _$createComponent(NotFound, {});
      }
      console.error(error);
      const details = error instanceof Error ? error.stack ?? error.message : String(error);
      return (() => {
        var _el$ = _tmpl$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.nextSibling,
          _el$4 = _el$3.nextSibling;
        _$insert(_el$4, details);
        return _el$;
      })();
    },
    get children() {
      return [_$createComponent(Meta, {
        name: "robots",
        content: "noindex, nofollow"
      }), _$createComponent(Show, {
        get when() {
          return data();
        },
        children: data => {
          const match = createMemo(() => Binary.search(data().session, data().sessionID, s => s.id));
          if (!match().found) throw new Error(`Session ${data().sessionID} not found`);
          const info = createMemo(() => data().session[match().index]);
          return [_$createComponent(Show, {
            get when() {
              return info().title;
            },
            get children() {
              return _$createComponent(Title, {
                get children() {
                  return [_$memo(() => info().title), " | Closedcode"];
                }
              });
            }
          }), _$createComponent(Meta, {
            name: "description",
            content: "closedcode - The AI coding agent built for the terminal."
          }), _$createComponent(ClientOnlyWorkerPoolProvider, {
            get children() {
              return _$createComponent(FileComponentProvider, {
                component: FileSSR,
                get children() {
                  return _$createComponent(DataProvider, {
                    get data() {
                      return data();
                    },
                    get directory() {
                      return info().directory;
                    },
                    get children() {
                      return iife(() => {
                        const [store, setStore] = createStore({
                          messageId: undefined
                        });
                        const messages = createMemo(() => data().sessionID ? (data().message[data().sessionID]?.filter(m => m.role === "user") ?? []).sort((a, b) => a.time.created - b.time.created) : []);
                        const firstUserMessage = createMemo(() => messages().at(0));
                        const activeMessage = createMemo(() => messages().find(m => m.id === store.messageId) ?? firstUserMessage());
                        function setActiveMessage(message) {
                          if (message) {
                            setStore("messageId", message.id);
                          } else {
                            setStore("messageId", undefined);
                          }
                        }
                        const provider = createMemo(() => activeMessage()?.model?.providerID);
                        const modelID = createMemo(() => activeMessage()?.model?.modelID);
                        const model = createMemo(() => data().model[data().sessionID]?.find(m => m.id === modelID()));
                        const diffs = createMemo(() => data().session_diff[data().sessionID] ?? []);
                        const [diffStyle, setDiffStyle] = createSignal("unified");
                        const title = () => (() => {
                          var _el$5 = _tmpl$2(),
                            _el$6 = _el$5.firstChild,
                            _el$7 = _el$6.firstChild,
                            _el$8 = _el$7.firstChild,
                            _el$9 = _el$8.firstChild,
                            _el$0 = _el$7.nextSibling,
                            _el$1 = _el$0.firstChild,
                            _el$10 = _el$1.firstChild,
                            _el$11 = _el$1.nextSibling,
                            _el$12 = _el$6.nextSibling;
                          _$insert(_el$7, _$createComponent(Mark, {
                            "class": "shrink-0 w-3 my-0.5"
                          }), _el$8);
                          _$insert(_el$8, () => info().version, null);
                          _$insert(_el$1, _$createComponent(Show, {
                            get when() {
                              return provider();
                            },
                            get children() {
                              return _$createComponent(ProviderIcon, {
                                get id() {
                                  return provider();
                                },
                                "class": "size-3.5 shrink-0 text-icon-strong-base"
                              });
                            }
                          }), _el$10);
                          _$insert(_el$10, () => model()?.name ?? modelID());
                          _$insert(_el$11, () => DateTime.fromMillis(info().time.created).toFormat("dd MMM yyyy, HH:mm"));
                          _$insert(_el$12, () => info().title);
                          return _el$5;
                        })();
                        const turns = () => (() => {
                          var _el$13 = _tmpl$3(),
                            _el$14 = _el$13.firstChild,
                            _el$15 = _el$14.nextSibling,
                            _el$16 = _el$15.nextSibling;
                          _$insert(_el$14, title);
                          _$insert(_el$15, _$createComponent(For, {
                            get each() {
                              return messages();
                            },
                            children: message => _$createComponent(SessionTurn, {
                              get sessionID() {
                                return data().sessionID;
                              },
                              get messageID() {
                                return message.id;
                              },
                              classes: {
                                root: "min-w-0 w-full relative",
                                content: "flex flex-col justify-between !overflow-visible",
                                container: "px-4"
                              }
                            })
                          }));
                          _$insert(_el$16, _$createComponent(Logo, {
                            "class": "w-58.5 opacity-12"
                          }));
                          return _el$13;
                        })();
                        const wide = createMemo(() => diffs().length === 0);
                        return (() => {
                          var _el$17 = _tmpl$7(),
                            _el$18 = _el$17.firstChild,
                            _el$19 = _el$18.firstChild,
                            _el$20 = _el$19.firstChild,
                            _el$21 = _el$19.nextSibling,
                            _el$22 = _el$18.nextSibling,
                            _el$23 = _el$22.firstChild,
                            _el$24 = _el$23.firstChild,
                            _el$25 = _el$24.firstChild,
                            _el$26 = _el$25.nextSibling;
                          _$insert(_el$20, _$createComponent(Mark, {}));
                          _$insert(_el$21, _$createComponent(IconButton, {
                            as: "a",
                            href: "https://github.com/informanellica/vanilla-closedcode",
                            target: "_blank",
                            icon: "github",
                            variant: "ghost"
                          }), null);
                          _$insert(_el$21, _$createComponent(IconButton, {
                            as: "a",
                            href: "https://discord.gg/6bvnqcH3",
                            target: "_blank",
                            icon: "discord",
                            variant: "ghost"
                          }), null);
                          _$classList(_el$24, {
                            "@container relative shrink-0 pt-14 flex flex-col gap-10 min-h-0 w-full": true
                          });
                          _$classList(_el$25, {
                            "w-full flex justify-start items-start min-w-0 px-6": true
                          });
                          _$insert(_el$25, title);
                          _$insert(_el$26, _$createComponent(Show, {
                            get when() {
                              return messages().length > 1;
                            },
                            get children() {
                              return _$createComponent(MessageNav, {
                                "class": "sticky top-0 shrink-0 py-2 pl-4",
                                get messages() {
                                  return messages();
                                },
                                get current() {
                                  return activeMessage();
                                },
                                size: "compact",
                                onMessageSelect: setActiveMessage
                              });
                            }
                          }), null);
                          _$insert(_el$26, _$createComponent(SessionTurn, {
                            get sessionID() {
                              return data().sessionID;
                            },
                            get messageID() {
                              return store.messageId ?? firstUserMessage().id;
                            },
                            classes: {
                              root: "grow",
                              content: "flex flex-col justify-between",
                              container: "w-full pb-20 px-6"
                            },
                            get children() {
                              var _el$27 = _tmpl$4();
                              _$classList(_el$27, {
                                "w-full flex items-center justify-center pb-8 shrink-0": true
                              });
                              _$insert(_el$27, _$createComponent(Logo, {
                                "class": "w-58.5 opacity-12"
                              }));
                              return _el$27;
                            }
                          }), null);
                          _$insert(_el$23, _$createComponent(Show, {
                            get when() {
                              return diffs().length > 0;
                            },
                            get children() {
                              var _el$28 = _tmpl$5();
                              _$insert(_el$28, _$createComponent(SessionReview, {
                                get diffs() {
                                  return diffs();
                                },
                                get diffStyle() {
                                  return diffStyle();
                                },
                                onDiffStyleChange: setDiffStyle,
                                classes: {
                                  root: "pb-20",
                                  header: "px-6",
                                  container: "px-6"
                                }
                              }));
                              return _el$28;
                            }
                          }), null);
                          _$insert(_el$22, _$createComponent(Switch, {
                            get children() {
                              return [_$createComponent(Match, {
                                get when() {
                                  return diffs().length > 0;
                                },
                                get children() {
                                  return _$createComponent(Tabs, {
                                    get classList() {
                                      return {
                                        "md:hidden": wide(),
                                        "lg:hidden": !wide()
                                      };
                                    },
                                    get children() {
                                      return [_$createComponent(Tabs.List, {
                                        get children() {
                                          return [_$createComponent(Tabs.Trigger, {
                                            value: "session",
                                            "class": "w-1/2",
                                            classes: {
                                              button: "w-full"
                                            },
                                            children: "Session"
                                          }), _$createComponent(Tabs.Trigger, {
                                            value: "review",
                                            "class": "w-1/2 !border-r-0",
                                            classes: {
                                              button: "w-full"
                                            },
                                            get children() {
                                              return [_$memo(() => diffs().length), " Files Changed"];
                                            }
                                          })];
                                        }
                                      }), _$createComponent(Tabs.Content, {
                                        value: "session",
                                        "class": "!overflow-hidden",
                                        get children() {
                                          return turns();
                                        }
                                      }), _$createComponent(Tabs.Content, {
                                        value: "review",
                                        "class": "!overflow-hidden hidden data-[selected]:block",
                                        get children() {
                                          var _el$29 = _tmpl$6();
                                          _$insert(_el$29, _$createComponent(SessionReview, {
                                            get diffs() {
                                              return diffs();
                                            },
                                            classes: {
                                              root: "pb-20",
                                              header: "px-4",
                                              container: "px-4"
                                            }
                                          }));
                                          return _el$29;
                                        }
                                      })];
                                    }
                                  });
                                }
                              }), _$createComponent(Match, {
                                when: true,
                                get children() {
                                  var _el$30 = _tmpl$4();
                                  _$insert(_el$30, turns);
                                  _$effect(_$p => _$classList(_el$30, {
                                    "!overflow-hidden": true,
                                    "md:hidden": wide(),
                                    "lg:hidden": !wide()
                                  }, _$p));
                                  return _el$30;
                                }
                              })];
                            }
                          }), null);
                          _$effect(_$p => _$classList(_el$23, {
                            "hidden w-full flex-1 min-h-0": true,
                            "md:flex": wide(),
                            "lg:flex": !wide()
                          }, _$p));
                          return _el$17;
                        })();
                      });
                    }
                  });
                }
              });
            }
          })];
        }
      })];
    }
  });
}
