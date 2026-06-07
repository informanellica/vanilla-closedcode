import {  Effect  } from "effect"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Server  } from "../../src/server/server.js"
import {  Session as SessionNs  } from "@/session/session.js"
import {  MessageID, PartID  } from "../../src/session/schema.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"

void Log.init({
  print: false
});
function run(fx) {
  return Effect.runPromise(fx.pipe(Effect.provide(SessionNs.defaultLayer)));
}
const svc = {
  ...SessionNs,
  create(input) {
    return run(SessionNs.Service.use(svc => svc.create(input)));
  },
  remove(id) {
    return run(SessionNs.Service.use(svc => svc.remove(id)));
  },
  updateMessage(msg) {
    return run(SessionNs.Service.use(svc => svc.updateMessage(msg)));
  },
  updatePart(part) {
    return run(SessionNs.Service.use(svc => svc.updatePart(part)));
  }
};
afterEach(async () => {
  await disposeAllInstances();
});
async function withoutWatcher(fn) {
  if (process.platform !== "win32") return fn();
  const prev = process.env.CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER;
  process.env.CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = "true";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER;else process.env.CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = prev;
  }
}
async function fill(sessionID, count, time = i => Date.now() + i) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = MessageID.ascending();
    ids.push(id);
    await svc.updateMessage({
      id,
      sessionID,
      role: "user",
      time: {
        created: time(i)
      },
      agent: "test",
      model: {
        providerID: "test",
        modelID: "test"
      },
      tools: {},
      mode: ""
    });
    await svc.updatePart({
      id: PartID.ascending(),
      sessionID,
      messageID: id,
      type: "text",
      text: `m${i}`
    });
  }
  return ids;
}
describe("session messages endpoint", () => {
  test("returns cursor headers for older pages", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await withoutWatcher(() => WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({});
        const ids = await fill(session.id, 5);
        const app = Server.Default().app;
        const a = await app.request(`/session/${session.id}/message?limit=2`);
        expect(a.status).toBe(200);
        const aBody = await a.json();
        expect(aBody.map(item => item.info.id)).toEqual(ids.slice(-2));
        const cursor = a.headers.get("x-next-cursor");
        expect(cursor).toBeTruthy();
        expect(a.headers.get("link")).toContain('rel="next"');
        const b = await app.request(`/session/${session.id}/message?limit=2&before=${encodeURIComponent(cursor)}`);
        expect(b.status).toBe(200);
        const bBody = await b.json();
        expect(bBody.map(item => item.info.id)).toEqual(ids.slice(-4, -2));
        await svc.remove(session.id);
      }
    }));
  });
  test("keeps full-history responses when limit is omitted", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await withoutWatcher(() => WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({});
        const ids = await fill(session.id, 3);
        const app = Server.Default().app;
        const res = await app.request(`/session/${session.id}/message`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.map(item => item.info.id)).toEqual(ids);
        await svc.remove(session.id);
      }
    }));
  });
  test("rejects invalid cursors and missing sessions", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await withoutWatcher(() => WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({});
        const app = Server.Default().app;
        const bad = await app.request(`/session/${session.id}/message?limit=2&before=bad`);
        expect(bad.status).toBe(400);
        const miss = await app.request(`/session/ses_missing/message?limit=2`);
        expect(miss.status).toBe(404);
        await svc.remove(session.id);
      }
    }));
  });
  test("does not truncate large legacy limit requests", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await withoutWatcher(() => WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({});
        await fill(session.id, 520);
        const app = Server.Default().app;
        const res = await app.request(`/session/${session.id}/message?limit=510`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(510);
        await svc.remove(session.id);
      }
    }));
  });
});