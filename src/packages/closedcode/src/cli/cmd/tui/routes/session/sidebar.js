import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { useProject } from "#tui/context/project.js";
import { useSync } from "#tui/context/sync.js";
import { createMemo, Show } from "solid-js";
import { useTheme } from "../../context/theme.js";
import { useTuiConfig } from "../../context/tui-config.js";
import { InstallationChannel, InstallationVersion } from "core/installation/version";
import { TuiPluginRuntime } from "#cli/cmd/tui/plugin/runtime.js";
import { getScrollAcceleration } from "../../util/scroll.js";
export function Sidebar(props) {
  const project = useProject();
  const sync = useSync();
  const {
    theme
  } = useTheme();
  const tuiConfig = useTuiConfig();
  const session = createMemo(() => sync.session.get(props.sessionID));
  const workspaceStatus = () => {
    const workspaceID = session()?.workspaceID;
    if (!workspaceID) return "error";
    return project.workspace.status(workspaceID) ?? "error";
  };
  const workspaceLabel = () => {
    const workspaceID = session()?.workspaceID;
    if (!workspaceID) return "unknown";
    const info = project.workspace.get(workspaceID);
    if (!info) return "unknown";
    return `${info.type}: ${info.name}`;
  };
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig));
  return _$createComponent(Show, {
    get when() {
      return session();
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("scrollbox"),
        _el$3 = _$createElement("box"),
        _el$11 = _$createElement("box");
      _$insertNode(_el$, _el$2);
      _$insertNode(_el$, _el$11);
      _$setProp(_el$, "width", 42);
      _$setProp(_el$, "height", "100%");
      _$setProp(_el$, "paddingTop", 1);
      _$setProp(_el$, "paddingBottom", 1);
      _$setProp(_el$, "paddingLeft", 2);
      _$setProp(_el$, "paddingRight", 2);
      _$insertNode(_el$2, _el$3);
      _$setProp(_el$2, "flexGrow", 1);
      _$setProp(_el$3, "flexShrink", 0);
      _$setProp(_el$3, "gap", 1);
      _$setProp(_el$3, "paddingRight", 1);
      _$insert(_el$3, _$createComponent(TuiPluginRuntime.Slot, {
        name: "sidebar_title",
        mode: "single_winner",
        get session_id() {
          return props.sessionID;
        },
        get title() {
          return session().title;
        },
        get share_url() {
          return session().share?.url;
        },
        get children() {
          var _el$4 = _$createElement("box"),
            _el$5 = _$createElement("text"),
            _el$6 = _$createElement("b");
          _$insertNode(_el$4, _el$5);
          _$setProp(_el$4, "paddingRight", 1);
          _$insertNode(_el$5, _el$6);
          _$insert(_el$6, () => session().title);
          _$insert(_el$4, _$createComponent(Show, {
            when: InstallationChannel !== "latest",
            get children() {
              var _el$7 = _$createElement("text");
              _$insert(_el$7, () => props.sessionID);
              _$effect(_$p => _$setProp(_el$7, "fg", theme.textMuted, _$p));
              return _el$7;
            }
          }), null);
          _$insert(_el$4, _$createComponent(Show, {
            get when() {
              return session().workspaceID;
            },
            get children() {
              var _el$8 = _$createElement("text"),
                _el$9 = _$createElement("span"),
                _el$1 = _$createTextNode(` `);
              _$insertNode(_el$8, _el$9);
              _$insertNode(_el$8, _el$1);
              _$insertNode(_el$9, _$createTextNode(`●`));
              _$insert(_el$8, workspaceLabel, null);
              _$effect(_p$ => {
                var _v$ = theme.textMuted,
                  _v$2 = {
                    fg: workspaceStatus() === "connected" ? theme.success : theme.error
                  };
                _v$ !== _p$.e && (_p$.e = _$setProp(_el$8, "fg", _v$, _p$.e));
                _v$2 !== _p$.t && (_p$.t = _$setProp(_el$9, "style", _v$2, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$8;
            }
          }), null);
          _$insert(_el$4, _$createComponent(Show, {
            get when() {
              return session().share?.url;
            },
            get children() {
              var _el$10 = _$createElement("text");
              _$insert(_el$10, () => session().share.url);
              _$effect(_$p => _$setProp(_el$10, "fg", theme.textMuted, _$p));
              return _el$10;
            }
          }), null);
          _$effect(_$p => _$setProp(_el$5, "fg", theme.text, _$p));
          return _el$4;
        }
      }), null);
      _$insert(_el$3, _$createComponent(TuiPluginRuntime.Slot, {
        name: "sidebar_content",
        get session_id() {
          return props.sessionID;
        }
      }), null);
      _$setProp(_el$11, "flexShrink", 0);
      _$setProp(_el$11, "gap", 1);
      _$setProp(_el$11, "paddingTop", 1);
      _$insert(_el$11, _$createComponent(TuiPluginRuntime.Slot, {
        name: "sidebar_footer",
        mode: "single_winner",
        get session_id() {
          return props.sessionID;
        },
        get children() {
          var _el$12 = _$createElement("text"),
            _el$13 = _$createElement("span"),
            _el$15 = _$createTextNode(` `),
            _el$16 = _$createElement("b"),
            _el$18 = _$createElement("span"),
            _el$19 = _$createElement("b"),
            _el$21 = _$createTextNode(` `),
            _el$22 = _$createElement("span");
          _$insertNode(_el$12, _el$13);
          _$insertNode(_el$12, _el$15);
          _$insertNode(_el$12, _el$16);
          _$insertNode(_el$12, _el$18);
          _$insertNode(_el$12, _el$21);
          _$insertNode(_el$12, _el$22);
          _$insertNode(_el$13, _$createTextNode(`•`));
          _$insertNode(_el$16, _$createTextNode(`Open`));
          _$insertNode(_el$18, _el$19);
          _$insertNode(_el$19, _$createTextNode(`Code`));
          _$insert(_el$22, InstallationVersion);
          _$effect(_p$ => {
            var _v$3 = theme.textMuted,
              _v$4 = {
                fg: theme.success
              },
              _v$5 = {
                fg: theme.text
              };
            _v$3 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$3, _p$.e));
            _v$4 !== _p$.t && (_p$.t = _$setProp(_el$13, "style", _v$4, _p$.t));
            _v$5 !== _p$.a && (_p$.a = _$setProp(_el$18, "style", _v$5, _p$.a));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined
          });
          return _el$12;
        }
      }));
      _$effect(_p$ => {
        var _v$6 = theme.backgroundPanel,
          _v$7 = props.overlay ? "absolute" : "relative",
          _v$8 = scrollAcceleration(),
          _v$9 = {
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive
            }
          };
        _v$6 !== _p$.e && (_p$.e = _$setProp(_el$, "backgroundColor", _v$6, _p$.e));
        _v$7 !== _p$.t && (_p$.t = _$setProp(_el$, "position", _v$7, _p$.t));
        _v$8 !== _p$.a && (_p$.a = _$setProp(_el$2, "scrollAcceleration", _v$8, _p$.a));
        _v$9 !== _p$.o && (_p$.o = _$setProp(_el$2, "verticalScrollbarOptions", _v$9, _p$.o));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined
      });
      return _el$;
    }
  });
}