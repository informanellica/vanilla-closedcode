import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class=size-full>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="h-dvh w-screen d-flex flex-column align-items-center justify-content-center bg-body">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2 w-100 max-w-sm"><span class="small fw-normal text-body text-center"></span><div class="d-flex flex-column gap-1 bg-body-tertiary rounded-3 p-2">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="h-dvh w-screen d-flex flex-column align-items-center justify-content-center bg-body gap-6 p-6"><div class="d-flex flex-column align-items-center max-w-md text-center"><p class="text-body"><span class="text-body-emphasis font-medium"></span></p><p class="mt-1 small fw-normal text-secondary">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<button type=button class="d-flex align-items-center gap-3 w-100 px-3 py-2 rounded-2 transition-colors text-left"><span class="text-body-emphasis truncate">`);
import * as Sentry from "@sentry/solid";
import { I18nProvider } from "@/lib/context.js";
import { DialogProvider } from "@/lib/dialog.js";
import { FileComponentProvider } from "@/vendor/ui/context/file.js";
import { MarkedProvider } from "@/vendor/ui/context/marked.js";
import { File } from "@/vendor/ui/components/file.js";
import { Font } from "@/vendor/ui/components/font.js";
import { Splash } from "@/vendor/ui/components/logo.js";
import { ThemeProvider } from "@/lib/theme.js";
import { MetaProvider } from "@solidjs/meta";
import { Navigate, Route, Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Effect } from "effect";
import { createMemo, createResource, createSignal, ErrorBoundary, For, lazy, onCleanup, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { CommandProvider } from "@/context/command.js";
import { CommentsProvider } from "@/context/comments.js";
import { FileProvider } from "@/context/file.js";
import { GlobalSDKProvider } from "@/context/global-sdk.js";
import { GlobalSyncProvider } from "@/context/global-sync.js";
import { HighlightsProvider } from "@/context/highlights.js";
import { LanguageProvider, useLanguage } from "@/context/language.js";
import { LayoutProvider } from "@/context/layout.js";
import { ModelsProvider } from "@/context/models.js";
import { NotificationProvider } from "@/context/notification.js";
import { PermissionProvider } from "@/context/permission.js";
import { PromptProvider } from "@/context/prompt.js";
import { ServerConnection, ServerProvider, serverName, useServer } from "@/context/server.js";
import { SettingsProvider } from "@/context/settings.js";
import { TerminalProvider } from "@/context/terminal.js";
import DirectoryLayout from "@/pages/directory-layout.js";
import Layout from "@/pages/layout.js";
import { ErrorPage } from "./pages/error.js";
import { useCheckServerHealth } from "./utils/server-health.js";
const HomeRoute = lazy(() => import("@/pages/home.js"));
const loadSession = () => import("@/pages/session.js");
const Session = lazy(loadSession);
const Loading = () => _tmpl$();
if (typeof location === "object" && /\/session(?:\/|$)/.test(location.pathname)) {
  void loadSession();
}
const SessionRoute = () => _$createComponent(SessionProviders, {
  get children() {
    return _$createComponent(ErrorBoundary, {
      fallback: error => {
        console.error("[SessionRoute] caught:", error)
        const el = document.createElement("div")
        el.style.cssText = "padding:24px;color:var(--text-base);font-family:var(--font-family-mono)"
        el.textContent = "Session view error (sidecar chat still works): " + (error?.message ?? error)
        return el
      },
      get children() {
        return _$createComponent(Session, {});
      }
    });
  }
});
const SessionIndexRoute = () => _$createComponent(Navigate, {
  href: "session"
});
function UiI18nBridge(props) {
  const language = useLanguage();
  return _$createComponent(I18nProvider, {
    get value() {
      return {
        locale: language.intl,
        t: language.t
      };
    },
    get children() {
      return props.children;
    }
  });
}
function QueryProvider(props) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false
      }
    }
  });
  return _$createComponent(QueryClientProvider, {
    client: client,
    get children() {
      return props.children;
    }
  });
}
function AppShellProviders(props) {
  return _$createComponent(SettingsProvider, {
    get children() {
      return _$createComponent(PermissionProvider, {
        get children() {
          return _$createComponent(LayoutProvider, {
            get children() {
              return _$createComponent(NotificationProvider, {
                get children() {
                  return _$createComponent(ModelsProvider, {
                    get children() {
                      return _$createComponent(CommandProvider, {
                        get children() {
                          return _$createComponent(HighlightsProvider, {
                            get children() {
                              return _$createComponent(Layout, {
                                get children() {
                                  return props.children;
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
}
function SessionProviders(props) {
  return _$createComponent(TerminalProvider, {
    get children() {
      return _$createComponent(FileProvider, {
        get children() {
          return _$createComponent(PromptProvider, {
            get children() {
              return _$createComponent(CommentsProvider, {
                get children() {
                  return props.children;
                }
              });
            }
          });
        }
      });
    }
  });
}
function RouterRoot(props) {
  return _$createComponent(AppShellProviders, {
    get children() {
      return [_$memo(() => props.appChildren), _$memo(() => props.children)];
    }
  });
}
export function AppBaseProviders(props) {
  return _$createComponent(MetaProvider, {
    get children() {
      return [_$createComponent(Font, {}), _$createComponent(ThemeProvider, {
        onThemeApplied: (_, mode) => {
          void window.api?.setTitlebar?.({
            mode
          });
        },
        get children() {
          return _$createComponent(LanguageProvider, {
            get locale() {
              return props.locale;
            },
            get children() {
              return _$createComponent(UiI18nBridge, {
                get children() {
                  return _$createComponent(ErrorBoundary, {
                    fallback: error => {
                      Sentry.captureException(error);
                      return _$createComponent(ErrorPage, {
                        error: error
                      });
                    },
                    get children() {
                      return _$createComponent(QueryProvider, {
                        get children() {
                          return _$createComponent(DialogProvider, {
                            get children() {
                              return _$createComponent(MarkedProvider, {
                                get children() {
                                  return _$createComponent(FileComponentProvider, {
                                    component: File,
                                    get children() {
                                      return props.children;
                                    }
                                  });
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      })];
    }
  });
}
function ConnectionGate(props) {
  const server = useServer();
  const checkServerHealth = useCheckServerHealth();
  const [checkMode, setCheckMode] = createSignal("blocking");

  // performs repeated health check with a grace period for
  // non-http connections, otherwise fails instantly
  const [startupHealthCheck, healthCheckActions] = createResource(() => props.disableHealthCheck ? true : Effect.gen(function* () {
    if (!server.current) return true;
    const {
      http,
      type
    } = server.current;
    while (true) {
      const res = yield* Effect.promise(() => checkServerHealth(http));
      if (res.healthy) return true;
      if (checkMode() === "background" || type === "http") return false;
    }
  }).pipe(Effect.timeoutOrElse({
    duration: "10 seconds",
    orElse: () => Effect.succeed(false)
  }), Effect.ensuring(Effect.sync(() => setCheckMode("background"))), Effect.runPromise));
  return _$createComponent(Suspense, {
    get fallback() {
      return (() => {
        var _el$2 = _tmpl$2();
        _$insert(_el$2, _$createComponent(Splash, {
          "class": "w-16 h-20 opacity-50 animate-pulse"
        }));
        return _el$2;
      })();
    },
    get children() {
      return [_$memo(() => _$memo(() => checkMode() === "blocking")() ? startupHealthCheck() : startupHealthCheck.latest), _$createComponent(Show, {
        get when() {
          return startupHealthCheck();
        },
        get fallback() {
          return _$createComponent(ConnectionError, {
            onRetry: () => {
              if (checkMode() === "background") void healthCheckActions.refetch();
            },
            onServerSelected: key => {
              setCheckMode("blocking");
              server.setActive(key);
              void healthCheckActions.refetch();
            }
          });
        },
        get children() {
          return props.children;
        }
      })];
    }
  });
}
function ConnectionError(props) {
  const language = useLanguage();
  const server = useServer();
  const others = () => server.list.filter(s => ServerConnection.key(s) !== server.key);
  const name = createMemo(() => server.name || server.key);
  const serverToken = "\u0000server\u0000";
  const unreachable = createMemo(() => language.t("app.server.unreachable", {
    server: serverToken
  }).split(serverToken));
  const timer = setInterval(() => props.onRetry?.(), 1000);
  onCleanup(() => clearInterval(timer));
  return (() => {
    var _el$3 = _tmpl$4(),
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.firstChild,
      _el$7 = _el$5.nextSibling;
    _$insert(_el$4, _$createComponent(Splash, {
      "class": "w-12 h-15 mb-4"
    }), _el$5);
    _$insert(_el$5, () => unreachable()[0], _el$6);
    _$insert(_el$6, name);
    _$insert(_el$5, () => unreachable()[1], null);
    _$insert(_el$7, () => language.t("app.server.retrying"));
    _$insert(_el$3, _$createComponent(Show, {
      get when() {
        return others().length > 0;
      },
      get children() {
        var _el$8 = _tmpl$3(),
          _el$9 = _el$8.firstChild,
          _el$0 = _el$9.nextSibling;
        _$insert(_el$9, () => language.t("app.server.otherServers"));
        _$insert(_el$0, _$createComponent(For, {
          get each() {
            return others();
          },
          children: conn => {
            const key = ServerConnection.key(conn);
            return (() => {
              var _el$1 = _tmpl$5(),
                _el$10 = _el$1.firstChild;
              _el$1.$$click = () => props.onServerSelected?.(key);
              _$insert(_el$10, () => serverName(conn));
              return _el$1;
            })();
          }
        }));
        return _el$8;
      }
    }), null);
    return _el$3;
  })();
}
function ServerKey(props) {
  const server = useServer();
  return _$createComponent(Show, {
    get when() {
      return server.key;
    },
    keyed: true,
    get children() {
      return props.children;
    }
  });
}
export function AppInterface(props) {
  return _$createComponent(ServerProvider, {
    get defaultServer() {
      return props.defaultServer;
    },
    get disableHealthCheck() {
      return props.disableHealthCheck;
    },
    get servers() {
      return props.servers;
    },
    get children() {
      return _$createComponent(ConnectionGate, {
        get disableHealthCheck() {
          return props.disableHealthCheck;
        },
        get children() {
          return _$createComponent(ServerKey, {
            get children() {
              return _$createComponent(QueryProvider, {
                get children() {
                  return _$createComponent(GlobalSDKProvider, {
                    get children() {
                      return _$createComponent(GlobalSyncProvider, {
                        get children() {
                          return _$createComponent(Dynamic, {
                            get component() {
                              return props.router ?? Router;
                            },
                            root: routerProps => _$createComponent(RouterRoot, {
                              get appChildren() {
                                return props.children;
                              },
                              get children() {
                                return routerProps.children;
                              }
                            }),
                            get children() {
                              return [_$createComponent(Route, {
                                path: "/",
                                component: HomeRoute
                              }), _$createComponent(Route, {
                                path: "/:dir",
                                component: DirectoryLayout,
                                get children() {
                                  return [_$createComponent(Route, {
                                    path: "/",
                                    component: SessionIndexRoute
                                  }), _$createComponent(Route, {
                                    path: "/session/:id?",
                                    component: SessionRoute
                                  })];
                                }
                              })];
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
}
_$delegateEvents(["click"]);