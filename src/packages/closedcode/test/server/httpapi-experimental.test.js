import {  Effect  } from "effect"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Server  } from "../../src/server/server.js"
import {  ExperimentalPaths  } from "../../src/server/routes/instance/httpapi/groups/experimental.js"
import {  Session  } from "#session/session.js"
import {  Database  } from "#storage/db.js"
import * as Log from "core/util/log";
import {  Worktree  } from "../../src/worktree/index.js"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import {  waitGlobalBusEventPromise  } from "./global-bus.js"
void Log.init({
  print: false
});
const original = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
const testWorktreeMutations = process.platform === "win32" ? test.skip : test;
function app() {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  return Server.Default().app;
}
function runSession(fx) {
  return Effect.runPromise(fx.pipe(Effect.provide(Session.defaultLayer)));
}
function createSession(input) {
  return runSession(Session.Service.use(svc => svc.create(input)));
}
async function waitReady(directory) {
  await waitGlobalBusEventPromise({
    message: "timed out waiting for worktree.ready",
    predicate: event => event.payload.type === Worktree.Event.Ready.type && event.directory === directory
  });
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original;
  await disposeAllInstances();
  await resetDatabase();
});
describe("experimental HttpApi", () => {
  test("serves read-only experimental endpoints through Express bridge", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false,
        mcp: {
          demo: {
            type: "local",
            command: ["echo", "demo"],
            enabled: false
          }
        }
      }
    });
    const headers = {
      "x-opencode-directory": tmp.path
    };
    const [consoleState, consoleOrgs, toolList, toolIDs, worktrees, resources] = await Promise.all([app().request(ExperimentalPaths.console, {
      headers
    }), app().request(ExperimentalPaths.consoleOrgs, {
      headers
    }), app().request(`${ExperimentalPaths.tool}?provider=opencode&model=gpt-5`, {
      headers
    }), app().request(ExperimentalPaths.toolIDs, {
      headers
    }), app().request(ExperimentalPaths.worktree, {
      headers
    }), app().request(ExperimentalPaths.resource, {
      headers
    })]);
    expect(consoleState.status).toBe(200);
    expect(await consoleState.json()).toEqual({
      consoleManagedProviders: [],
      switchableOrgCount: 0
    });
    expect(consoleOrgs.status).toBe(200);
    expect(await consoleOrgs.json()).toEqual({
      orgs: []
    });
    expect(toolList.status).toBe(200);
    expect(await toolList.json()).toContainEqual(expect.objectContaining({
      id: "bash",
      description: expect.any(String),
      parameters: expect.any(Object)
    }));
    expect(toolIDs.status).toBe(200);
    expect(await toolIDs.json()).toContain("bash");
    expect(worktrees.status).toBe(200);
    expect(await worktrees.json()).toEqual([]);
    expect(resources.status).toBe(200);
    expect(await resources.json()).toEqual({});
  });
  test("serves Console org switch through Express bridge", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false
      }
    });
    await Database.useAsync(h => h.sequelize.query(
      "INSERT INTO account (id, email, url, access_token, refresh_token, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
      { replacements: ["account-test", "test@example.com", "https://console.example.com", "access", "refresh", Date.now(), Date.now()], transaction: h.tx }
    ));
    const switched = await app().request(ExperimentalPaths.consoleSwitch, {
      method: "POST",
      headers: {
        "x-opencode-directory": tmp.path,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountID: "account-test",
        orgID: "org-test"
      })
    });
    expect(switched.status).toBe(200);
    expect(await switched.json()).toBe(true);
  });
  test("serves global session list through Express bridge", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const first = await WithInstance.provide({
      directory: tmp.path,
      fn: async () => createSession({
        title: "page-one"
      })
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await WithInstance.provide({
      directory: tmp.path,
      fn: async () => createSession({
        title: "page-two"
      })
    });
    const headers = {
      "x-opencode-directory": tmp.path
    };
    const page = await app().request(`${ExperimentalPaths.session}?${new URLSearchParams({
      directory: tmp.path,
      limit: "1"
    })}`, {
      headers
    });
    expect(page.status).toBe(200);
    expect(page.headers.get("x-next-cursor")).toBeTruthy();
    const body = await page.json();
    expect(body.map(session => session.id)).toEqual([second.id]);
    expect(body[0].project?.id).toBe(second.projectID);
    const next = await app().request(`${ExperimentalPaths.session}?${new URLSearchParams({
      directory: tmp.path,
      limit: "10",
      cursor: body[0].time.updated.toString()
    })}`, {
      headers
    });
    expect(next.status).toBe(200);
    expect((await next.json()).map(session => session.id)).toContain(first.id);
  });
  testWorktreeMutations("serves worktree mutations through Express bridge", async () => {
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
    const created = await app().request(ExperimentalPaths.worktree, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "api-test"
      })
    });
    expect(created.status).toBe(200);
    const info = await created.json();
    expect(info).toMatchObject({
      name: "api-test",
      branch: "closedcode/api-test"
    });
    await waitReady(info.directory);
    const listed = await app().request(ExperimentalPaths.worktree, {
      headers
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toContain(info.directory);
    if (process.platform !== "win32") {
      const reset = await app().request(ExperimentalPaths.worktreeReset, {
        method: "POST",
        headers,
        body: JSON.stringify({
          directory: info.directory
        })
      });
      expect(reset.status).toBe(200);
      expect(await reset.json()).toBe(true);
    }
    const removed = await app().request(ExperimentalPaths.worktree, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        directory: info.directory
      })
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toBe(true);
    const afterRemove = await app().request(ExperimentalPaths.worktree, {
      headers
    });
    expect(afterRemove.status).toBe(200);
    expect(await afterRemove.json()).toEqual([]);
  });
});