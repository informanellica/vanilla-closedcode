import {  createOpencodeClient  } from "sdk/v2"
import {  RGBA  } from "@opentui/core"
import {  createPluginKeybind  } from "../../src/cli/cmd/tui/context/plugin-keybinds.js"
function themeCurrent() {
  const a = RGBA.fromInts(0, 120, 240);
  const b = RGBA.fromInts(120, 120, 120);
  const c = RGBA.fromInts(230, 230, 230);
  const d = RGBA.fromInts(120, 30, 30);
  const e = RGBA.fromInts(140, 100, 40);
  const f = RGBA.fromInts(20, 140, 80);
  const g = RGBA.fromInts(20, 80, 160);
  const h = RGBA.fromInts(40, 40, 40);
  const i = RGBA.fromInts(60, 60, 60);
  const j = RGBA.fromInts(80, 80, 80);
  return {
    primary: a,
    secondary: b,
    accent: a,
    error: d,
    warning: e,
    success: f,
    info: g,
    text: c,
    textMuted: b,
    selectedListItemText: h,
    background: h,
    backgroundPanel: h,
    backgroundElement: i,
    backgroundMenu: i,
    border: j,
    borderActive: c,
    borderSubtle: i,
    diffAdded: f,
    diffRemoved: d,
    diffContext: b,
    diffHunkHeader: b,
    diffHighlightAdded: f,
    diffHighlightRemoved: d,
    diffAddedBg: h,
    diffRemovedBg: h,
    diffContextBg: h,
    diffLineNumber: b,
    diffAddedLineNumberBg: h,
    diffRemovedLineNumberBg: h,
    markdownText: c,
    markdownHeading: c,
    markdownLink: a,
    markdownLinkText: g,
    markdownCode: f,
    markdownBlockQuote: e,
    markdownEmph: e,
    markdownStrong: c,
    markdownHorizontalRule: b,
    markdownListItem: a,
    markdownListEnumeration: g,
    markdownImage: a,
    markdownImageText: g,
    markdownCodeBlock: c,
    syntaxComment: b,
    syntaxKeyword: a,
    syntaxFunction: g,
    syntaxVariable: c,
    syntaxString: f,
    syntaxNumber: e,
    syntaxType: a,
    syntaxOperator: a,
    syntaxPunctuation: c,
    thinkingOpacity: 0.6
  };
}
function createTuiPluginApi(opts = {}) {
  const kv = {};
  const count = opts.count;
  const ctrl = new AbortController();
  const own = createOpencodeClient({
    baseUrl: "http://localhost:4096"
  });
  const fallback = () => own;
  const read = typeof opts.client === "function" ? opts.client : opts.client ? () => opts.client : fallback;
  const client = () => read();
  let depth = 0;
  let size = "medium";
  const has = opts.theme?.has ?? (() => false);
  let selected = opts.theme?.selected ?? "closedcode";
  const key = {
    match: opts.keybind?.match ?? (() => false),
    print: opts.keybind?.print ?? (name => name)
  };
  const set = opts.theme?.set ?? (name => {
    if (!has(name)) return false;
    selected = name;
    return true;
  });
  const renderer = opts.renderer ?? {
    ...Object.create(null),
    once() {
      return this;
    }
  };
  function kvGet(name, fallback) {
    const value = kv[name];
    if (value === undefined) return fallback;
    return value;
  }
  return {
    app: {
      get version() {
        return opts.app?.version ?? "0.0.0-test";
      }
    },
    get client() {
      return client();
    },
    event: {
      on: () => {
        if (count) count.event_add += 1;
        return () => {
          if (!count) return;
          count.event_drop += 1;
        };
      }
    },
    renderer,
    slots: {
      register: () => "fixture-slot"
    },
    plugins: {
      list: () => [],
      activate: async () => false,
      deactivate: async () => false,
      add: async () => false,
      install: async () => ({
        ok: false,
        message: "not implemented in fixture"
      })
    },
    lifecycle: {
      signal: ctrl.signal,
      onDispose() {
        return () => {};
      }
    },
    command: {
      register: () => {
        if (count) count.command_add += 1;
        return () => {
          if (!count) return;
          count.command_drop += 1;
        };
      },
      trigger: () => {},
      show: () => {}
    },
    route: {
      register: () => {
        if (count) count.route_add += 1;
        return () => {
          if (!count) return;
          count.route_drop += 1;
        };
      },
      navigate: () => {},
      get current() {
        return {
          name: "home"
        };
      }
    },
    ui: {
      Dialog: () => null,
      DialogAlert: () => null,
      DialogConfirm: () => null,
      DialogPrompt: () => null,
      DialogSelect: () => null,
      Slot: () => null,
      Prompt: () => null,
      toast: () => {},
      dialog: {
        replace: () => {
          depth = 1;
        },
        clear: () => {
          depth = 0;
          size = "medium";
        },
        setSize: next => {
          size = next;
        },
        get size() {
          return size;
        },
        get depth() {
          return depth;
        },
        get open() {
          return depth > 0;
        }
      }
    },
    keybind: {
      ...key,
      create: opts.keybind?.create ?? ((defaults, over) => {
        return createPluginKeybind(key, defaults, over);
      })
    },
    tuiConfig: opts.tuiConfig ?? {},
    kv: {
      get: kvGet,
      set(name, value) {
        kv[name] = value;
      },
      get ready() {
        return true;
      }
    },
    state: {
      get ready() {
        return opts.state?.ready ?? true;
      },
      get config() {
        return opts.state?.config ?? {};
      },
      get provider() {
        return opts.state?.provider ?? [];
      },
      get path() {
        return opts.state?.path ?? {
          home: "",
          state: "",
          config: "",
          worktree: "",
          directory: ""
        };
      },
      get vcs() {
        return opts.state?.vcs;
      },
      session: {
        count: opts.state?.session?.count ?? (() => 0),
        diff: opts.state?.session?.diff ?? (() => []),
        todo: opts.state?.session?.todo ?? (() => []),
        messages: opts.state?.session?.messages ?? (() => []),
        status: opts.state?.session?.status ?? (() => undefined),
        permission: opts.state?.session?.permission ?? (() => []),
        question: opts.state?.session?.question ?? (() => [])
      },
      part: opts.state?.part ?? (() => []),
      lsp: opts.state?.lsp ?? (() => []),
      mcp: opts.state?.mcp ?? (() => [])
    },
    theme: {
      get current() {
        return opts.theme?.current ?? themeCurrent();
      },
      get selected() {
        return selected;
      },
      has(name) {
        return has(name);
      },
      set(name) {
        return set(name);
      },
      async install(file) {
        if (opts.theme?.install) return opts.theme.install(file);
        throw new Error("base theme.install should not run");
      },
      mode() {
        if (opts.theme?.mode) return opts.theme.mode();
        return "dark";
      },
      get ready() {
        return opts.theme?.ready ?? true;
      }
    }
  };
}
export { createTuiPluginApi };
