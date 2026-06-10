import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Prompt } from "#tui/component/prompt/index.js";
import { createEffect, createSignal } from "solid-js";
import { Logo } from "../component/logo.js";
import { useProject } from "../context/project.js";
import { useSync } from "../context/sync.js";
import { Toast } from "../ui/toast.js";
import { useArgs } from "../context/args.js";
import { useRouteData } from "#tui/context/route.js";
import { usePromptRef } from "../context/prompt.js";
import { useLocal } from "../context/local.js";
import { TuiPluginRuntime } from "#cli/cmd/tui/plugin/runtime.js";
let once = false;
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"]
};
export function Home() {
  const sync = useSync();
  const project = useProject();
  const route = useRouteData("home");
  const promptRef = usePromptRef();
  const [ref, setRef] = createSignal();
  const args = useArgs();
  const local = useLocal();
  let sent = false;
  const bind = r => {
    setRef(r);
    promptRef.set(r);
    if (once || !r) return;
    if (route.prompt) {
      r.set(route.prompt);
      once = true;
      return;
    }
    if (!args.prompt) return;
    r.set({
      input: args.prompt,
      parts: []
    });
    once = true;
  };

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref();
    if (sent) return;
    if (!r) return;
    if (!sync.ready || !local.model.ready) return;
    if (!args.prompt) return;
    if (r.current.input !== args.prompt) return;
    sent = true;
    r.submit();
  });
  return [(() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("box"),
      _el$6 = _$createElement("box"),
      _el$7 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$insertNode(_el$, _el$4);
    _$insertNode(_el$, _el$5);
    _$insertNode(_el$, _el$6);
    _$insertNode(_el$, _el$7);
    _$setProp(_el$, "flexGrow", 1);
    _$setProp(_el$, "alignItems", "center");
    _$setProp(_el$, "paddingLeft", 2);
    _$setProp(_el$, "paddingRight", 2);
    _$setProp(_el$2, "flexGrow", 1);
    _$setProp(_el$2, "minHeight", 0);
    _$setProp(_el$3, "height", 4);
    _$setProp(_el$3, "minHeight", 0);
    _$setProp(_el$3, "flexShrink", 1);
    _$setProp(_el$4, "flexShrink", 0);
    _$insert(_el$4, _$createComponent(TuiPluginRuntime.Slot, {
      name: "home_logo",
      mode: "replace",
      get children() {
        return _$createComponent(Logo, {});
      }
    }));
    _$setProp(_el$5, "height", 1);
    _$setProp(_el$5, "minHeight", 0);
    _$setProp(_el$5, "flexShrink", 1);
    _$setProp(_el$6, "width", "100%");
    _$setProp(_el$6, "maxWidth", 75);
    _$setProp(_el$6, "zIndex", 1000);
    _$setProp(_el$6, "paddingTop", 1);
    _$setProp(_el$6, "flexShrink", 0);
    _$insert(_el$6, _$createComponent(TuiPluginRuntime.Slot, {
      name: "home_prompt",
      mode: "replace",
      get workspace_id() {
        return project.workspace.current();
      },
      ref: bind,
      get children() {
        return _$createComponent(Prompt, {
          ref: bind,
          get workspaceID() {
            return project.workspace.current();
          },
          get right() {
            return _$createComponent(TuiPluginRuntime.Slot, {
              name: "home_prompt_right",
              get workspace_id() {
                return project.workspace.current();
              }
            });
          },
          placeholders: placeholder
        });
      }
    }));
    _$insert(_el$, _$createComponent(TuiPluginRuntime.Slot, {
      name: "home_bottom"
    }), _el$7);
    _$setProp(_el$7, "flexGrow", 1);
    _$setProp(_el$7, "minHeight", 0);
    _$insert(_el$, _$createComponent(Toast, {}), null);
    return _el$;
  })(), (() => {
    var _el$8 = _$createElement("box");
    _$setProp(_el$8, "width", "100%");
    _$setProp(_el$8, "flexShrink", 0);
    _$insert(_el$8, _$createComponent(TuiPluginRuntime.Slot, {
      name: "home_footer",
      mode: "single_winner"
    }));
    return _el$8;
  })()];
}