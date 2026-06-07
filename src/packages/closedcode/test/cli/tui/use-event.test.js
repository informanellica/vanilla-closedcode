let _$template;
let _$createComponent;
var _tmpl$ = /*#__PURE__*/_$template(`<box>`);
/** @jsxImportSource @opentui/solid */
import {  template as _$template  } from "@opentui/solid"
import {  createComponent as _$createComponent  } from "@opentui/solid"
import {  testRender  } from "@opentui/solid"
import {  onMount  } from "solid-js"
import {  ProjectProvider, useProject  } from "../../../src/cli/cmd/tui/context/project.js"
import {  SDKProvider  } from "../../../src/cli/cmd/tui/context/sdk.js"
import {  useEvent  } from "../../../src/cli/cmd/tui/context/event.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import { sleep } from "../../lib/io.js";

async function wait(fn, timeout = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition");
    await sleep(10);
  }
}
function event(payload, input) {
  return {
    directory: input.directory,
    workspace: input.workspace,
    payload
  };
}
function vcs(branch) {
  return {
    id: `evt_vcs_${branch}`,
    type: "vcs.branch.updated",
    properties: {
      branch
    }
  };
}
function update(version) {
  return {
    id: `evt_update_${version}`,
    type: "installation.update-available",
    properties: {
      version
    }
  };
}
function createSource() {
  let fn;
  return {
    source: {
      subscribe: async handler => {
        fn = handler;
        return () => {
          if (fn === handler) fn = undefined;
        };
      }
    },
    emit(evt) {
      if (!fn) throw new Error("event source not ready");
      fn(evt);
    }
  };
}
async function mount() {
  const source = createSource();
  const seen = [];
  let project;
  let done;
  const ready = new Promise(resolve => {
    done = resolve;
  });
  const app = await testRender(() => _$createComponent(SDKProvider, {
    url: "http://test",
    directory: "/tmp/root",
    get events() {
      return source.source;
    },
    get children() {
      return _$createComponent(ProjectProvider, {
        get children() {
          return _$createComponent(Probe, {
            onReady: ctx => {
              project = ctx.project;
              done();
            },
            seen: seen
          });
        }
      });
    }
  }));
  await ready;
  return {
    app,
    emit: source.emit,
    project,
    seen
  };
}
function Probe(props) {
  const project = useProject();
  const event = useEvent();
  onMount(() => {
    event.subscribe(evt => {
      props.seen.push(evt);
    });
    props.onReady({
      project
    });
  });
  return _tmpl$();
}
describe("useEvent", () => {
  test("delivers matching directory events without an active workspace", async () => {
    const {
      app,
      emit,
      seen
    } = await mount();
    try {
      emit(event(vcs("main"), {
        directory: "/tmp/root"
      }));
      await wait(() => seen.length === 1);
      expect(seen).toEqual([vcs("main")]);
    } finally {
      app.renderer.destroy();
    }
  });
  test("ignores non-matching directory events without an active workspace", async () => {
    const {
      app,
      emit,
      seen
    } = await mount();
    try {
      emit(event(vcs("other"), {
        directory: "/tmp/other"
      }));
      await sleep(30);
      expect(seen).toHaveLength(0);
    } finally {
      app.renderer.destroy();
    }
  });
  test("delivers matching workspace events when a workspace is active", async () => {
    const {
      app,
      emit,
      project,
      seen
    } = await mount();
    try {
      project.workspace.set("ws_a");
      emit(event(vcs("ws"), {
        directory: "/tmp/other",
        workspace: "ws_a"
      }));
      await wait(() => seen.length === 1);
      expect(seen).toEqual([vcs("ws")]);
    } finally {
      app.renderer.destroy();
    }
  });
  test("ignores non-matching workspace events when a workspace is active", async () => {
    const {
      app,
      emit,
      project,
      seen
    } = await mount();
    try {
      project.workspace.set("ws_a");
      emit(event(vcs("ws"), {
        directory: "/tmp/root",
        workspace: "ws_b"
      }));
      await sleep(30);
      expect(seen).toHaveLength(0);
    } finally {
      app.renderer.destroy();
    }
  });
  test("delivers truly global events even when a workspace is active", async () => {
    const {
      app,
      emit,
      project,
      seen
    } = await mount();
    try {
      project.workspace.set("ws_a");
      emit(event(update("1.2.3"), {
        directory: "global"
      }));
      await wait(() => seen.length === 1);
      expect(seen).toEqual([update("1.2.3")]);
    } finally {
      app.renderer.destroy();
    }
  });
});