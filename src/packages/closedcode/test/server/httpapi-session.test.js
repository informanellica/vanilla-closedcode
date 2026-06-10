import {  Effect  } from "effect"
import * as DateTime from "effect/DateTime";
import {  eq  } from "drizzle-orm"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  it  } from "../lib/effect.js"
import {  Flag  } from "core/flag/flag"
import {  registerAdapter  } from "../../src/control-plane/adapters/index.js"
import {  Workspace  } from "../../src/control-plane/workspace.js"
import {  PermissionID  } from "../../src/permission/schema.js"
import {  ModelID, ProviderID  } from "../../src/provider/schema.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Project  } from "../../src/project/project.js"
import {  Server  } from "../../src/server/server.js"
import {  SessionPaths  } from "../../src/server/routes/instance/httpapi/groups/session.js"
import {  Session  } from "#session/session.js"
import {  MessageID, PartID  } from "../../src/session/schema.js"
import {  Database  } from "#storage/db.js"
import {  SessionMessageTable, SessionTable  } from "#session/session.sql.js"
import {  SessionMessage  } from "../../src/v2/session-message.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, beforeAll  } from "@jest/globals"
import {  mkdir  } from "node:fs/promises"
import path from "node:path";
void Log.init({
  print: false
});
const original = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
const originalWorkspaces = Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES;
function app() {
  return Server.Default().app;
}
function runSession(fx) {
  return Effect.runPromise(fx.pipe(Effect.provide(Session.defaultLayer)));
}
function pathFor(path, params) {
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`:${key}`, value), path);
}
function createSession(directory, input) {
  return Effect.promise(async () => await WithInstance.provide({
    directory,
    fn: () => runSession(Session.Service.use(svc => svc.create(input)))
  }));
}
function createTextMessage(directory, sessionID, text) {
  return Effect.promise(async () => await WithInstance.provide({
    directory,
    fn: () => runSession(Effect.gen(function* () {
      const svc = yield* Session.Service;
      const info = yield* svc.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID,
        agent: "build",
        model: {
          providerID: ProviderID.make("test"),
          modelID: ModelID.make("test")
        },
        time: {
          created: Date.now()
        }
      });
      const part = yield* svc.updatePart({
        id: PartID.ascending(),
        sessionID,
        messageID: info.id,
        type: "text",
        text
      });
      return {
        info,
        part
      };
    }))
  }));
}
const localAdapter = directory => ({
  name: "Local Test",
  description: "Create a local test workspace",
  configure: info => ({
    ...info,
    name: "local-test",
    directory
  }),
  create: async () => {
    await mkdir(directory, {
      recursive: true
    });
  },
  async remove() {},
  target: () => ({
    type: "local",
    directory
  })
});
const createLocalWorkspace = input => Effect.gen(function* () {
  registerAdapter(input.projectID, input.type, localAdapter(input.directory));
  return yield* Workspace.Service.use(svc => svc.create({
    type: input.type,
    branch: null,
    extra: null,
    projectID: input.projectID
  })).pipe(Effect.provide(Workspace.defaultLayer));
});
function request(path, init) {
  return Effect.promise(async () => app().request(path, init));
}
function requestWithBackend(_experimental, path, init) {
  return Effect.promise(async () => app().request(path, init));
}
function json(response) {
  return Effect.promise(async () => {
    if (response.status !== 200) throw new Error(await response.text());
    return await response.json();
  });
}
function requestJson(path, init) {
  return request(path, init).pipe(Effect.flatMap(json));
}
function withTmp(options, fn) {
  return Effect.acquireRelease(Effect.promise(() => tmpdir(options)), tmp => Effect.promise(() => tmp[Symbol.asyncDispose]())).pipe(Effect.flatMap(fn));
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original;
  Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = originalWorkspaces;
  await disposeAllInstances();
  await resetDatabase();
});
describe("session HttpApi", () => {
  it.live("serves read routes through Express bridge", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path
    };
    const parent = yield* createSession(tmp.path, {
      title: "parent"
    });
    const child = yield* createSession(tmp.path, {
      title: "child",
      parentID: parent.id
    });
    const message = yield* createTextMessage(tmp.path, parent.id, "hello");
    yield* createTextMessage(tmp.path, parent.id, "world");
    const listed = yield* requestJson(`${SessionPaths.list}?roots=true`, {
      headers
    });
    expect(listed.map(item => item.id)).toContain(parent.id);
    expect(Object.hasOwn(listed[0], "parentID")).toBe(false);
    expect(yield* requestJson(SessionPaths.status, {
      headers
    })).toEqual({});
    expect(yield* requestJson(pathFor(SessionPaths.get, {
      sessionID: parent.id
    }), {
      headers
    })).toMatchObject({
      id: parent.id,
      title: "parent"
    });
    expect((yield* requestJson(pathFor(SessionPaths.children, {
      sessionID: parent.id
    }), {
      headers
    })).map(item => item.id)).toEqual([child.id]);
    expect(yield* requestJson(pathFor(SessionPaths.todo, {
      sessionID: parent.id
    }), {
      headers
    })).toEqual([]);
    expect(yield* requestJson(pathFor(SessionPaths.diff, {
      sessionID: parent.id
    }), {
      headers
    })).toEqual([]);
    const messages = yield* request(`${pathFor(SessionPaths.messages, {
      sessionID: parent.id
    })}?limit=1`, {
      headers
    });
    const messagePage = yield* json(messages);
    const nextCursor = messages.headers.get("x-next-cursor");
    expect(nextCursor).toBeTruthy();
    expect(messagePage[0]?.parts[0]).toMatchObject({
      type: "text"
    });
    expect((yield* request(`${pathFor(SessionPaths.messages, {
      sessionID: parent.id
    })}?before=${nextCursor}`, {
      headers
    })).status).toBe(400);
    expect((yield* request(`${pathFor(SessionPaths.messages, {
      sessionID: parent.id
    })}?limit=1&before=invalid`, {
      headers
    })).status).toBe(400);
    expect(yield* requestJson(pathFor(SessionPaths.message, {
      sessionID: parent.id,
      messageID: message.info.id
    }), {
      headers
    })).toMatchObject({
      info: {
        id: message.info.id
      }
    });
    yield* Effect.promise(() => WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const message = new SessionMessage.Assistant({
          id: SessionMessage.ID.create(),
          type: "assistant",
          agent: "build",
          model: {
            id: "model",
            providerID: "provider"
          },
          time: {
            created: DateTime.makeUnsafe(1)
          },
          content: []
        });
        Database.use(db => db.insert(SessionMessageTable).values([{
          id: message.id,
          session_id: parent.id,
          type: message.type,
          time_created: 1,
          data: {
            time: {
              created: 1
            },
            agent: message.agent,
            model: message.model,
            content: message.content
          }
        }]).run());
      }
    }));
    expect((yield* requestJson(`/api/session/${parent.id}/message`, {
      headers
    })).items).toMatchObject([{
      type: "assistant"
    }]);
  })));
  it.live("serves lifecycle mutation routes through Express bridge", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false,
      share: "disabled"
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path,
      "content-type": "application/json"
    };
    const createdEmpty = yield* requestJson(SessionPaths.create, {
      method: "POST",
      headers
    });
    expect(createdEmpty.id).toBeTruthy();
    const created = yield* requestJson(SessionPaths.create, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "created"
      })
    });
    expect(created.title).toBe("created");
    const updated = yield* requestJson(pathFor(SessionPaths.update, {
      sessionID: created.id
    }), {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        title: "updated",
        time: {
          archived: 1
        }
      })
    });
    expect(updated).toMatchObject({
      id: created.id,
      title: "updated",
      time: {
        archived: 1
      }
    });
    const forked = yield* requestJson(pathFor(SessionPaths.fork, {
      sessionID: created.id
    }), {
      method: "POST",
      headers,
      body: JSON.stringify({})
    });
    expect(forked.id).not.toBe(created.id);
    expect(yield* requestJson(pathFor(SessionPaths.abort, {
      sessionID: created.id
    }), {
      method: "POST",
      headers
    })).toBe(true);
    expect(yield* requestJson(pathFor(SessionPaths.remove, {
      sessionID: created.id
    }), {
      method: "DELETE",
      headers
    })).toBe(true);
  })));
  it.live("persists selected workspace id when creating a session", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false,
      share: "disabled"
    }
  }, tmp => Effect.gen(function* () {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = true;
    const project = yield* Project.use.fromDirectory(tmp.path).pipe(Effect.provide(Project.defaultLayer));
    const workspace = yield* createLocalWorkspace({
      projectID: project.project.id,
      type: "session-create-workspace",
      directory: path.join(tmp.path, ".workspace-local")
    });
    const created = yield* requestJson(`${SessionPaths.create}?workspace=${workspace.id}`, {
      method: "POST",
      headers: {
        "x-closedcode-directory": tmp.path,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "workspace session"
      })
    });
    expect(created).toMatchObject({
      id: created.id,
      workspaceID: workspace.id
    });
    expect(yield* Effect.sync(() => Database.use(db => db.select({
      workspaceID: SessionTable.workspace_id
    }).from(SessionTable).where(eq(SessionTable.id, created.id)).get()))).toEqual({
      workspaceID: workspace.id
    });
  })));
  it.live("matches legacy archived timestamp validation", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path,
      "content-type": "application/json"
    };
    const legacy = yield* createSession(tmp.path, {
      title: "legacy"
    });
    const effect = yield* createSession(tmp.path, {
      title: "effect"
    });
    const body = JSON.stringify({
      time: {
        archived: -1
      }
    });
    const legacyResponse = yield* requestWithBackend(false, pathFor(SessionPaths.update, {
      sessionID: legacy.id
    }), {
      method: "PATCH",
      headers,
      body
    });
    expect(legacyResponse.status).toBe(200);
    expect((yield* json(legacyResponse)).time.archived).toBe(-1);
    const effectResponse = yield* requestWithBackend(true, pathFor(SessionPaths.update, {
      sessionID: effect.id
    }), {
      method: "PATCH",
      headers,
      body
    });
    expect(effectResponse.status).toBe(legacyResponse.status);
    expect((yield* json(effectResponse)).time.archived).toBe(-1);
  })));
  it.live("matches legacy project-scoped path and directory precedence", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const currentDir = path.join(tmp.path, "packages", "closedcode", "src");
    yield* Effect.promise(() => mkdir(currentDir, {
      recursive: true
    }));
    const pathSession = yield* createSession(currentDir);
    const pathlessSession = yield* createSession(currentDir);
    yield* Effect.sync(() => Database.use(db => db.update(SessionTable).set({
      path: null
    }).where(eq(SessionTable.id, pathlessSession.id)).run()));
    const query = new URLSearchParams({
      scope: "project",
      path: "packages/closedcode/src",
      directory: currentDir
    });
    const headers = {
      "x-closedcode-directory": tmp.path
    };
    const legacy = (yield* json(yield* requestWithBackend(false, `${SessionPaths.list}?${query}`, {
      headers
    }))).map(item => item.id);
    const effect = (yield* json(yield* requestWithBackend(true, `${SessionPaths.list}?${query}`, {
      headers
    }))).map(item => item.id);
    expect(legacy).toContain(pathSession.id);
    expect(legacy).not.toContain(pathlessSession.id);
    expect(effect).toEqual(legacy);
  })));
  it.live("matches legacy paginated message link headers", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path
    };
    const session = yield* createSession(tmp.path, {
      title: "messages"
    });
    yield* createTextMessage(tmp.path, session.id, "first");
    yield* createTextMessage(tmp.path, session.id, "second");
    const route = `${pathFor(SessionPaths.messages, {
      sessionID: session.id
    })}?limit=1`;
    const legacy = yield* requestWithBackend(false, route, {
      headers
    });
    const effect = yield* requestWithBackend(true, route, {
      headers
    });
    expect(effect.headers.get("x-next-cursor")).toBe(legacy.headers.get("x-next-cursor"));
    expect(effect.headers.get("link")).toBe(legacy.headers.get("link"));
    expect(effect.headers.get("access-control-expose-headers")).toBe(legacy.headers.get("access-control-expose-headers"));
  })));
  it.live("serves message mutation routes through Express bridge", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path,
      "content-type": "application/json"
    };
    const session = yield* createSession(tmp.path, {
      title: "messages"
    });
    const first = yield* createTextMessage(tmp.path, session.id, "first");
    const second = yield* createTextMessage(tmp.path, session.id, "second");
    const updated = yield* requestJson(pathFor(SessionPaths.updatePart, {
      sessionID: session.id,
      messageID: first.info.id,
      partID: first.part.id
    }), {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...first.part,
        text: "updated"
      })
    });
    expect(updated).toMatchObject({
      id: first.part.id,
      type: "text",
      text: "updated"
    });
    expect(yield* requestJson(pathFor(SessionPaths.deletePart, {
      sessionID: session.id,
      messageID: first.info.id,
      partID: first.part.id
    }), {
      method: "DELETE",
      headers
    })).toBe(true);
    expect(yield* requestJson(pathFor(SessionPaths.deleteMessage, {
      sessionID: session.id,
      messageID: second.info.id
    }), {
      method: "DELETE",
      headers
    })).toBe(true);
  })));
  it.live("serves remaining non-LLM session mutation routes through Express bridge", withTmp({
    git: true,
    config: {
      formatter: false,
      lsp: false
    }
  }, tmp => Effect.gen(function* () {
    const headers = {
      "x-closedcode-directory": tmp.path,
      "content-type": "application/json"
    };
    const session = yield* createSession(tmp.path, {
      title: "remaining"
    });
    expect(yield* requestJson(pathFor(SessionPaths.revert, {
      sessionID: session.id
    }), {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageID: MessageID.ascending()
      })
    })).toMatchObject({
      id: session.id
    });
    expect(yield* requestJson(pathFor(SessionPaths.unrevert, {
      sessionID: session.id
    }), {
      method: "POST",
      headers
    })).toMatchObject({
      id: session.id
    });
    expect(yield* requestJson(pathFor(SessionPaths.permissions, {
      sessionID: session.id,
      permissionID: String(PermissionID.ascending())
    }), {
      method: "POST",
      headers,
      body: JSON.stringify({
        response: "once"
      })
    })).toBe(true);
  })));
});