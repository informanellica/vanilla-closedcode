import {  Effect  } from "effect"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Server  } from "../../src/server/server.js"
import {  SyncPaths  } from "../../src/server/routes/instance/httpapi/groups/sync.js"
import {  Session  } from "#session/session.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll, jest  } from "@jest/globals"
void Log.init({
  print: false
});
const originalHttpApi = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
const originalWorkspaces = Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES;
function app(httpapi = true) {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = httpapi;
  return httpapi ? Server.Default().app : Server.Legacy().app;
}
function runSession(fx) {
  return Effect.runPromise(fx.pipe(Effect.provide(Session.defaultLayer)));
}
afterEach(async () => {
  jest.restoreAllMocks();
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi;
  Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = originalWorkspaces;
  await disposeAllInstances();
  await resetDatabase();
});
describe("sync HttpApi", () => {
  test("serves sync routes through Express bridge", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = true;
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const headers = {
      "x-opencode-directory": tmp.path,
      "content-type": "application/json"
    };
    const info = jest.spyOn(Log.create({
      service: "server.sync"
    }), "info");
    const session = await WithInstance.provide({
      directory: tmp.path,
      fn: async () => runSession(Session.Service.use(svc => svc.create({
        title: "sync"
      })))
    });
    const started = await app().request(SyncPaths.start, {
      method: "POST",
      headers
    });
    expect(started.status).toBe(200);
    expect(await started.json()).toBe(true);
    const history = await app().request(SyncPaths.history, {
      method: "POST",
      headers,
      body: JSON.stringify({})
    });
    expect(history.status).toBe(200);
    const rows = await history.json();
    expect(rows.map(row => row.aggregate_id)).toContain(session.id);
    const replayed = await app().request(SyncPaths.replay, {
      method: "POST",
      headers,
      body: JSON.stringify({
        directory: tmp.path,
        events: rows.filter(row => row.aggregate_id === session.id).map(row => ({
          id: row.id,
          aggregateID: row.aggregate_id,
          seq: row.seq,
          type: row.type,
          data: row.data
        }))
      })
    });
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual({
      sessionID: session.id
    });
    expect(info.mock.calls.some(([message]) => message === "sync replay requested")).toBe(true);
    expect(info.mock.calls.some(([message]) => message === "sync replay complete")).toBe(true);
  });
  test("matches legacy seq validation", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const headers = {
      "x-opencode-directory": tmp.path,
      "content-type": "application/json"
    };
    const cases = [{
      path: SyncPaths.history,
      body: {
        aggregate: -1
      }
    }, {
      path: SyncPaths.history,
      body: {
        aggregate: 1.5
      }
    }, {
      path: SyncPaths.replay,
      body: {
        directory: tmp.path,
        events: [{
          id: "event",
          aggregateID: "session",
          seq: -1,
          type: "session.created",
          data: {}
        }]
      }
    }, {
      path: SyncPaths.replay,
      body: {
        directory: tmp.path,
        events: [{
          id: "event",
          aggregateID: "session",
          seq: 1.5,
          type: "session.created",
          data: {}
        }]
      }
    }];
    for (const item of cases) {
      const legacy = await app(false).request(item.path, {
        method: "POST",
        headers,
        body: JSON.stringify(item.body)
      });
      const httpapi = await app(true).request(item.path, {
        method: "POST",
        headers,
        body: JSON.stringify(item.body)
      });
      expect(httpapi.status).toBe(legacy.status);
      expect(httpapi.status).toBe(400);
    }
  });
});