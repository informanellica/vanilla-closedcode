import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
// Page shell: a left-aligned start screen modeled on the Bootstrap 5.3
// "Starter template" example. A brand header (small logo + title) sits top-left
// with a full-width rule beneath it; then a hero block (heading + intro +
// primary action) closed by a short rule; then a 2-column grid of link-list
// sections (Start | Configuration, Recent | Server).
var _tmplShell = /*#__PURE__*/_$template(`<div class="container-fluid px-4 px-xl-5 py-4 overflow-y-auto"><header data-component=home-header class="d-flex align-items-center pb-3 mb-4 border-bottom"><div data-slot=home-title class="fs-4 fw-semibold text-body-emphasis"></div></header><div data-component=home-hero class="pb-3 mb-4 border-bottom"><h1 data-slot=hero-title class="fs-2 fw-semibold text-body-emphasis"></h1><p data-slot=hero-intro class="col-md-10 fs-6 text-secondary"></p></div><div data-component=home-grid class="row g-5">`),
  // A titled section: a bold heading (with an optional trailing action slot on
  // the right) and a body container. Each section is a grid column.
  _tmplSection = /*#__PURE__*/_$template(`<div class="col-md-6"><div class="d-flex align-items-center justify-content-between mb-3"><h2 data-slot=section-title class="fs-5 fw-semibold text-body-emphasis mb-0"></h2></div><div data-slot=section-body class="d-flex flex-column gap-1">`),
  // The relative "2 hours ago" suffix on a recent-project row.
  _tmplMuted = /*#__PURE__*/_$template(`<div class="small fw-normal text-secondary ms-auto ps-3 flex-shrink-0">`),
  // Server status line: a colored dot, an "Online/Offline" label and the host.
  _tmplServer = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2 px-2 py-2"><span></span><span data-slot=server-state class="fw-medium text-body-emphasis"></span><span data-slot=server-host class="small fw-normal text-secondary font-monospace">`),
  _tmplEmpty = /*#__PURE__*/_$template(`<div class="small fw-normal text-secondary px-2 py-1">`);
import { createMemo, For, Show } from "solid-js";
import { Button } from "@/bs/button.js";
import { Logo } from "@/vendor/ui/components/logo.js";
import { useLayout } from "@/context/layout.js";
import { useNavigate } from "@solidjs/router";
import { base64Encode } from "core/util/encode";
import { usePlatform } from "@/context/platform.js";
import { DateTime } from "luxon";
import { useDialog } from "@/lib/dialog.js";
import { DialogSelectDirectory } from "@/components/dialog-select-directory.js";
import { useServer } from "@/context/server.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
export default function Home() {
  const sync = useGlobalSync();
  const layout = useLayout();
  const platform = usePlatform();
  const dialog = useDialog();
  const navigate = useNavigate();
  const server = useServer();
  const language = useLanguage();
  const homedir = createMemo(() => sync.data?.path.home);
  const recent = createMemo(() => {
    return sync.data?.project.slice().sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created)).slice(0, 5) ?? [];
  });
  const serverDotClass = createMemo(() => {
    const healthy = server.healthy();
    if (healthy === true) return "bg-icon-success-base";
    if (healthy === false) return "bg-icon-critical-base";
    return "bg-border-weak-base";
  });
  const serverState = createMemo(() => {
    const healthy = server.healthy();
    if (healthy === true) return language.t("home.server.online");
    if (healthy === false) return language.t("home.server.offline");
    return language.t("home.server.connecting");
  });
  function openProject(directory) {
    layout.projects.open(directory);
    server.projects.touch(directory);
    navigate(`/${base64Encode(directory)}`);
  }
  async function chooseProject() {
    function resolve(result) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory);
        }
      } else if (result) {
        openProject(result);
      }
    }
    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true
      });
      resolve(result);
    } else {
      dialog.show(() => _$createComponent(DialogSelectDirectory, {
        multiple: true,
        onSelect: resolve
      }), () => resolve(null));
    }
  }
  // Provider connect flow: same dialog the layout's "プロバイダーに接続" command
  // opens. Loaded lazily so the home route doesn't pull the provider editor up
  // front. (DialogSelectProvider only uses contexts available on the home route.)
  function connectProvider() {
    void import("@/components/dialog-select-provider.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSelectProvider, {}));
    });
  }
  // Settings dialog, optionally deep-linked to a tab. The dialog only exposes
  // three tabs (general / shortcuts / connection), so the Configuration column
  // maps Providers/Agents -> "connection" and Settings/Permissions -> "general".
  function openSettings(tab) {
    void import("@/components/dialog-settings.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSettings, {
        tab: tab
      }));
    });
  }
  // The "管理" link in the Server section header just opens Settings on the
  // connection (LLM/provider) tab — no separate server-picker modal. Local LLM
  // setup lives there, which is what users actually want from this section.
  function manageServers() {
    openSettings("connection");
  }
  // A single clickable row inside a section, styled like the Bootstrap
  // starter-template link list: a blue text link with a LEADING → arrow.
  function Row(props) {
    return _$createComponent(Button, {
      size: "normal",
      variant: "ghost",
      "class": "text-left px-2 w-100 text-decoration-none link-primary",
      get classList() {
        return {
          "font-monospace": !!props.mono,
          // Icon + label always sit hard-left (justify-start). When there is a
          // hint, the hint element itself carries `ms-auto` to float right — so
          // the label stays left instead of being centered between icon and hint.
          "justify-content-start": true
        };
      },
      // Leading → arrow matches the template's link lists; callers may override
      // (e.g. a recent project keeps the arrow too for visual consistency).
      get icon() {
        return props.icon ?? "arrow-right";
      },
      get onClick() {
        return props.onClick;
      },
      get children() {
        return [_$memo(() => props.label), _$createComponent(Show, {
          get when() {
            return props.hint;
          },
          get children() {
            var _hint = _tmplMuted();
            _$insert(_hint, () => props.hint);
            return _hint;
          }
        })];
      }
    });
  }
  // A titled section block (heading + optional header action + body).
  function Section(props) {
    var _el$ = _tmplSection(),
      _head = _el$.firstChild,
      _title = _head.firstChild,
      _body = _head.nextSibling;
    _$insert(_title, () => props.title);
    if (props.action) _$insert(_head, props.action, null);
    _$insert(_body, () => props.children);
    return _el$;
  }
  return (() => {
    var _shell = _tmplShell(),
      _header = _shell.firstChild,
      _title = _header.firstChild,
      _hero = _header.nextSibling,
      _heroTitle = _hero.firstChild,
      _heroIntro = _heroTitle.nextSibling,
      _grid = _hero.nextSibling;
    // Brand mark: small (~36px), top-left, before the title — app identity, not
    // a faint watermark. A full-width rule sits beneath the header (border-bottom
    // on the header), mirroring the starter-template's brand row.
    _$insert(_header, _$createComponent(Logo, {
      "class": "w-10 flex-shrink-0 me-3 text-body-emphasis"
    }), _title);
    _$insert(_title, "ClosedCode");

    // Hero: a short heading + one-line intro + the primary "Open folder" action,
    // matching the starter-template's "Download examples" call to action.
    _$insert(_heroTitle, () => language.t("home.hero.title"));
    _$insert(_heroIntro, () => language.t("home.hero.intro"));
    _$insert(_hero, _$createComponent(Button, {
      variant: "primary",
      size: "large",
      icon: "folder-add-left",
      onClick: chooseProject,
      get children() {
        return language.t("home.hero.cta");
      }
    }), null);

    // Start: primary actions.
    _$insert(_grid, _$createComponent(Section, {
      get title() {
        return language.t("home.section.start");
      },
      get children() {
        return [_$createComponent(Row, {
          icon: "folder",
          get label() {
            return language.t("command.project.open");
          },
          onClick: chooseProject
        }), _$createComponent(Row, {
          icon: "new-session",
          get label() {
            return language.t("command.session.new");
          },
          // No project is open on the home route and a session needs one, so
          // "new session" falls back to the folder picker (same as the layout's
          // startNewSession fallback).
          onClick: chooseProject
        }), _$createComponent(Row, {
          icon: "providers",
          get label() {
            return language.t("command.provider.connect");
          },
          onClick: connectProvider
        }), _$createComponent(Row, {
          icon: "settings-gear",
          get label() {
            return language.t("command.settings.open");
          },
          onClick: () => openSettings("general")
        })];
      }
    }), null);

    // Configuration: settings sub-areas. The settings dialog has general /
    // shortcuts / connection tabs; Providers & Agents map to "connection",
    // Permissions maps to "general" (closest existing entry).
    _$insert(_grid, _$createComponent(Section, {
      get title() {
        return language.t("home.section.configuration");
      },
      get children() {
        return [_$createComponent(Row, {
          icon: "settings-gear",
          get label() {
            return language.t("settings.tab.general");
          },
          onClick: () => openSettings("general")
        }), _$createComponent(Row, {
          icon: "providers",
          get label() {
            return language.t("settings.providers.title");
          },
          onClick: () => openSettings("connection")
        }), _$createComponent(Row, {
          icon: "agent",
          get label() {
            return language.t("settings.agents.title");
          },
          onClick: () => openSettings("connection")
        }), _$createComponent(Row, {
          icon: "shield",
          get label() {
            return language.t("settings.permissions.title");
          },
          onClick: () => openSettings("general")
        })];
      }
    }), null);

    // Recent: recent project folders. Clicking a row opens it; a header action
    // exposes the folder picker.
    _$insert(_grid, _$createComponent(Section, {
      get title() {
        return language.t("home.recentProjects");
      },
      get action() {
        return _$createComponent(Button, {
          size: "small",
          variant: "ghost",
          icon: "folder-add-left",
          "class": "px-2 py-0 small text-secondary",
          onClick: chooseProject,
          get children() {
            return language.t("command.project.open");
          }
        });
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return recent().length > 0;
          },
          get fallback() {
            var _empty = _tmplEmpty();
            _$insert(_empty, () => language.t("home.empty.title"));
            return _empty;
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return recent();
              },
              children: project => _$createComponent(Row, {
                icon: "folder",
                mono: true,
                get label() {
                  return project.worktree.replace(homedir(), "~");
                },
                get hint() {
                  return DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative();
                },
                onClick: () => openProject(project.worktree)
              })
            });
          }
        });
      }
    }), null);

    // Server: STATUS DISPLAY ONLY. Clicking the status does NOT open the picker.
    // The header "管理" link is the unobtrusive entry into server management.
    _$insert(_grid, _$createComponent(Section, {
      get title() {
        return language.t("home.section.server");
      },
      get action() {
        return _$createComponent(Button, {
          size: "small",
          variant: "ghost",
          icon: "settings-gear",
          "class": "px-2 py-0 small text-secondary",
          onClick: manageServers,
          get children() {
            return language.t("home.server.manage");
          }
        });
      },
      get children() {
        var _srv = _tmplServer(),
          _dot = _srv.firstChild,
          _state = _dot.nextSibling,
          _host = _state.nextSibling;
        _$effect(_$p => _$classList(_dot, {
          "size-2 rounded-circle flex-shrink-0": true,
          [serverDotClass()]: true
        }, _$p));
        _$insert(_state, serverState);
        _$insert(_host, _$memo(() => server.name));
        return _srv;
      }
    }), null);

    return _shell;
  })();
}
