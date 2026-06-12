// insert() from solid-js/web is the established exception for reactive /
// component-valued children (Suspense/Show branches, For-mapped rows): Solid
// keeps reconciling the accessors instead of freezing a one-time snapshot.
import { insert as _solidInsert } from "solid-js/web";
import * as Sentry from "@sentry/browser";
import { I18nProvider } from "@/lib/context.js";
import { DialogProvider } from "@/lib/dialog.js";
import { FileComponentProvider } from "@/vendor/ui/context/file.js";
import { MarkedProvider } from "@/vendor/ui/context/marked.js";
import { File } from "@/vendor/ui/components/file.js";
import { Font } from "@/vendor/ui/components/font.js";
import { Splash } from "@/vendor/ui/components/logo.js";
import { ThemeProvider } from "@/lib/theme.js";
import { MetaProvider } from "@/lib/primitives/meta.js";
import { Navigate, Route, Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Effect } from "effect";
import { createComponent, createMemo, createRenderEffect, createResource, createSignal, ErrorBoundary, For, lazy, onCleanup, Show, Suspense } from "solid-js";
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

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Static markup only — translated or user-provided strings are always
// assigned via textContent/text nodes, never interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
const HomeRoute = lazy(() => import("@/pages/home.js"));
const loadSession = () => import("@/pages/session.js");
const Session = lazy(loadSession);
const Loading = () => template(`<div class="size-full"></div>`);
if (typeof location === "object" && /\/session(?:\/|$)/.test(location.pathname)) {
  void loadSession();
}
const SessionRoute = () => createComponent(SessionProviders, {
  get children() {
    return createComponent(ErrorBoundary, {
      fallback: error => {
        console.error("[SessionRoute] caught:", error)
        const el = document.createElement("div")
        el.style.cssText = "padding:24px;color:var(--text-base);font-family:var(--font-family-mono)"
        el.textContent = "Session view error (sidecar chat still works): " + (error?.message ?? error)
        return el
      },
      get children() {
        return createComponent(Session, {});
      }
    });
  }
});
const SessionIndexRoute = () => createComponent(Navigate, {
  href: "session"
});
function UiI18nBridge(props) {
  const language = useLanguage();
  return createComponent(I18nProvider, {
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
  return createComponent(QueryClientProvider, {
    client: client,
    get children() {
      return props.children;
    }
  });
}
function AppShellProviders(props) {
  return createComponent(SettingsProvider, {
    get children() {
      return createComponent(PermissionProvider, {
        get children() {
          return createComponent(LayoutProvider, {
            get children() {
              return createComponent(NotificationProvider, {
                get children() {
                  return createComponent(ModelsProvider, {
                    get children() {
                      return createComponent(CommandProvider, {
                        get children() {
                          return createComponent(HighlightsProvider, {
                            get children() {
                              return createComponent(Layout, {
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
  return createComponent(TerminalProvider, {
    get children() {
      return createComponent(FileProvider, {
        get children() {
          return createComponent(PromptProvider, {
            get children() {
              return createComponent(CommentsProvider, {
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
  return createComponent(AppShellProviders, {
    get children() {
      // Memo accessors keep the forwarded router children live downstream.
      return [createMemo(() => props.appChildren), createMemo(() => props.children)];
    }
  });
}
export function AppBaseProviders(props) {
  return createComponent(MetaProvider, {
    get children() {
      return [createComponent(Font, {}), createComponent(ThemeProvider, {
        onThemeApplied: (_, mode) => {
          void window.api?.setTitlebar?.({
            mode
          });
        },
        get children() {
          return createComponent(LanguageProvider, {
            get locale() {
              return props.locale;
            },
            get children() {
              return createComponent(UiI18nBridge, {
                get children() {
                  return createComponent(ErrorBoundary, {
                    fallback: error => {
                      Sentry.captureException(error);
                      return createComponent(ErrorPage, {
                        error: error
                      });
                    },
                    get children() {
                      return createComponent(QueryProvider, {
                        get children() {
                          return createComponent(DialogProvider, {
                            get children() {
                              return createComponent(MarkedProvider, {
                                get children() {
                                  return createComponent(FileComponentProvider, {
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
  return createComponent(Suspense, {
    get fallback() {
      const el = template(`<div class="h-dvh w-screen d-flex flex-column align-items-center justify-content-center bg-body"></div>`);
      // Splash returns a concrete element, so a plain append suffices.
      el.appendChild(createComponent(Splash, {
        "class": "w-16 h-20 opacity-50 animate-pulse"
      }));
      return el;
    },
    get children() {
      // The leading memo child re-reads the health-check resource so Suspense
      // keeps tracking it; its boolean value itself renders nothing, exactly
      // like the compiled expression child.
      return [createMemo(() => checkMode() === "blocking" ? startupHealthCheck() : startupHealthCheck.latest), createComponent(Show, {
        get when() {
          return startupHealthCheck();
        },
        get fallback() {
          return createComponent(ConnectionError, {
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

  // Static skeleton. All translated/server strings are bound via text nodes
  // or textContent below, never interpolated into the markup.
  const root = template(`<div class="h-dvh w-screen d-flex flex-column align-items-center justify-content-center bg-body gap-6 p-6"><div class="d-flex flex-column align-items-center max-w-md text-center" data-slot="column"><p class="text-body" data-slot="message"><span class="text-body-emphasis font-medium" data-slot="name"></span></p><p class="mt-1 small fw-normal text-secondary" data-slot="retrying"></p></div></div>`);
  const column = root.querySelector('[data-slot="column"]');
  const message = root.querySelector('[data-slot="message"]');
  const nameEl = root.querySelector('[data-slot="name"]');
  const retryingEl = root.querySelector('[data-slot="retrying"]');

  // Splash mark before the message block (Splash returns a concrete element).
  column.insertBefore(createComponent(Splash, {
    "class": "w-12 h-15 mb-4"
  }), message);

  // "<prefix><server name><suffix>" — live text nodes around the static span,
  // matching the compiled insert order. Render-effects keep every translated
  // string live across locale switches.
  const prefixText = document.createTextNode("");
  message.insertBefore(prefixText, nameEl);
  const suffixText = document.createTextNode("");
  message.appendChild(suffixText);
  createRenderEffect(() => {
    prefixText.data = unreachable()[0] ?? "";
  });
  createRenderEffect(() => {
    suffixText.data = unreachable()[1] ?? "";
  });
  createRenderEffect(() => {
    nameEl.textContent = name() ?? "";
  });
  createRenderEffect(() => {
    retryingEl.textContent = language.t("app.server.retrying");
  });

  // Other-servers block. Show + For are kept so row DOM identity survives
  // list updates; appended after the message column via insert() with an
  // explicit null marker (append mode, established exception).
  _solidInsert(root, createComponent(Show, {
    get when() {
      return others().length > 0;
    },
    get children() {
      const block = template(`<div class="d-flex flex-column gap-2 w-100 max-w-sm"><span class="small fw-normal text-body text-center" data-slot="label"></span><div class="d-flex flex-column gap-1 bg-body-tertiary rounded-3 p-2" data-slot="list"></div></div>`);
      const label = block.querySelector('[data-slot="label"]');
      const list = block.querySelector('[data-slot="list"]');
      createRenderEffect(() => {
        label.textContent = language.t("app.server.otherServers");
      });
      _solidInsert(list, createComponent(For, {
        get each() {
          return others();
        },
        children: conn => {
          const key = ServerConnection.key(conn);
          const button = template(`<button type="button" class="d-flex align-items-center gap-3 w-100 px-3 py-2 rounded-2 transition-colors text-left"><span class="text-body-emphasis truncate"></span></button>`);
          const nameSpan = button.firstChild;
          button.addEventListener("click", () => props.onServerSelected?.(key));
          createRenderEffect(() => {
            nameSpan.textContent = serverName(conn);
          });
          return button;
        }
      }));
      return block;
    }
  }), null);
  return root;
}
function ServerKey(props) {
  const server = useServer();
  return createComponent(Show, {
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
  return createComponent(ServerProvider, {
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
      return createComponent(ConnectionGate, {
        get disableHealthCheck() {
          return props.disableHealthCheck;
        },
        get children() {
          return createComponent(ServerKey, {
            get children() {
              return createComponent(QueryProvider, {
                get children() {
                  return createComponent(GlobalSDKProvider, {
                    get children() {
                      return createComponent(GlobalSyncProvider, {
                        get children() {
                          return createComponent(Dynamic, {
                            get component() {
                              return props.router ?? Router;
                            },
                            root: routerProps => createComponent(RouterRoot, {
                              get appChildren() {
                                return props.children;
                              },
                              get children() {
                                return routerProps.children;
                              }
                            }),
                            get children() {
                              return [createComponent(Route, {
                                path: "/",
                                component: HomeRoute
                              }), createComponent(Route, {
                                path: "/:dir",
                                component: DirectoryLayout,
                                get children() {
                                  return [createComponent(Route, {
                                    path: "/",
                                    component: SessionIndexRoute
                                  }), createComponent(Route, {
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
