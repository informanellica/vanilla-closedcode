let _$template;
let _$createComponent;
var _tmpl$ = /*#__PURE__*/_$template(`<box>`);
/** @jsxImportSource @opentui/solid */
import {  template as _$template  } from "@opentui/solid"
import {  createComponent as _$createComponent  } from "@opentui/solid"
import {  testRender  } from "@opentui/solid"
import {  onMount  } from "solid-js"
import {  Global  } from "core/global"
import {  ArgsProvider  } from "../../../../src/cli/cmd/tui/context/args.js"
import {  ExitProvider  } from "../../../../src/cli/cmd/tui/context/exit.js"
import {  KVProvider, useKV  } from "../../../../src/cli/cmd/tui/context/kv.js"
import {  ProjectProvider  } from "../../../../src/cli/cmd/tui/context/project.js"
import {  SDKProvider  } from "../../../../src/cli/cmd/tui/context/sdk.js"
import {  SyncProvider, useSync  } from "../../../../src/cli/cmd/tui/context/sync.js"
import {  tmpdir  } from "../../../fixture/fixture.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import { sleep, writeFile } from "../../../lib/io.js";

const worktree = "/tmp/opencode";
const directory = `${worktree}/packages/closedcode`;
async function wait(fn, timeout = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition");
    await sleep(10);
  }
}
function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json"
    }
  });
}
function eventSource() {
  return {
    subscribe: async () => () => {}
  };
}
function createFetch() {
  const session = [];
  const fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/session") session.push(url);
    switch (url.pathname) {
      case "/agent":
      case "/command":
      case "/experimental/workspace":
      case "/experimental/workspace/status":
      case "/formatter":
      case "/lsp":
        return json([]);
      case "/config":
      case "/experimental/resource":
      case "/mcp":
      case "/provider/auth":
      case "/session/status":
        return json({});
      case "/config/providers":
        return json({
          providers: {},
          default: {}
        });
      case "/experimental/console":
        return json({
          consoleManagedProviders: [],
          switchableOrgCount: 0
        });
      case "/path":
        return json({
          home: "",
          state: "",
          config: "",
          worktree,
          directory
        });
      case "/project/current":
        return json({
          id: "proj_test"
        });
      case "/provider":
        return json({
          all: [],
          default: {},
          connected: []
        });
      case "/session":
        return json([]);
      case "/vcs":
        return json({
          branch: "main"
        });
    }
    throw new Error(`unexpected request: ${url.pathname}`);
  };
  return {
    fetch,
    session
  };
}
async function mount() {
  const calls = createFetch();
  let sync;
  let kv;
  let done;
  const ready = new Promise(resolve => {
    done = resolve;
  });
  const app = await testRender(() => _$createComponent(ArgsProvider, {
    get children() {
      return _$createComponent(ExitProvider, {
        get children() {
          return _$createComponent(KVProvider, {
            get children() {
              return _$createComponent(SDKProvider, {
                url: "http://test",
                directory: directory,
                get fetch() {
                  return calls.fetch;
                },
                get events() {
                  return eventSource();
                },
                get children() {
                  return _$createComponent(ProjectProvider, {
                    get children() {
                      return _$createComponent(SyncProvider, {
                        get children() {
                          return _$createComponent(Probe, {
                            onReady: ctx => {
                              sync = ctx.sync;
                              kv = ctx.kv;
                              done();
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
  }));
  await ready;
  await wait(() => sync.status === "complete");
  return {
    app,
    kv,
    sync,
    session: calls.session
  };
}
function Probe(props) {
  const kv = useKV();
  const sync = useSync();
  onMount(() => {
    props.onReady({
      kv,
      sync
    });
  });
  return _tmpl$();
}
describe("tui sync", () => {
  test("refresh scopes sessions by default and lists project sessions when disabled", async () => {
    const previous = Global.Path.state;
    await using tmp = await tmpdir();
    Global.Path.state = tmp.path;
    await writeFile(`${tmp.path}/kv.json`, "{}");
    const {
      app,
      kv,
      sync,
      session
    } = await mount();
    try {
      expect(kv.get("session_directory_filter_enabled", true)).toBe(true);
      expect(session.at(-1)?.searchParams.get("scope")).toBeNull();
      expect(session.at(-1)?.searchParams.get("path")).toBe("packages/closedcode");
      kv.set("session_directory_filter_enabled", false);
      await sync.session.refresh();
      expect(session.at(-1)?.searchParams.get("scope")).toBe("project");
      expect(session.at(-1)?.searchParams.get("path")).toBeNull();
    } finally {
      app.renderer.destroy();
      Global.Path.state = previous;
    }
  });
});