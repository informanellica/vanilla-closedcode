import {  Effect  } from "effect"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, provideInstance, tmpdir  } from "../fixture/fixture.js"
import {  GlobalBus  } from "../../src/bus/global.js"
import {  Snapshot  } from "../../src/snapshot/index.js"
import {  Server  } from "../../src/server/server.js"
import {  Filesystem  } from "#util/filesystem.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
void Log.init({
  print: false
});
afterEach(async () => {
  await resetDatabase();
});
const disposedEvents = (seen, dir) => seen.filter(evt => evt.directory === dir && evt.payload.type === "server.instance.disposed").length;
describe("project.initGit endpoint", () => {
  test("initializes git and reloads immediately", async () => {
    await using tmp = await tmpdir();
    const app = Server.Default().app;
    const seen = [];
    const fn = evt => {
      seen.push(evt);
    };
    GlobalBus.on("event", fn);
    try {
      const init = await app.request("/project/git/init", {
        method: "POST",
        headers: {
          "x-opencode-directory": tmp.path
        }
      });
      const body = await init.json();
      expect(init.status).toBe(200);
      expect(body).toMatchObject({
        id: "global",
        vcs: "git",
        worktree: tmp.path
      });
      // Reload behavior: bus emits exactly one server.instance.disposed for the directory.
      expect(disposedEvents(seen, tmp.path)).toBe(1);
      expect(await Filesystem.exists(path.join(tmp.path, ".git", "opencode"))).toBe(false);
      const current = await app.request("/project/current", {
        headers: {
          "x-opencode-directory": tmp.path
        }
      });
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({
        id: "global",
        vcs: "git",
        worktree: tmp.path
      });
      expect(await Effect.runPromise(Snapshot.Service.use(svc => svc.track()).pipe(provideInstance(tmp.path), Effect.provide(Snapshot.defaultLayer)))).toBeTruthy();
    } finally {
      await disposeAllInstances();
      GlobalBus.off("event", fn);
    }
  });
  test("does not reload when the project is already git", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const app = Server.Default().app;
    const seen = [];
    const fn = evt => {
      seen.push(evt);
    };
    GlobalBus.on("event", fn);
    try {
      const init = await app.request("/project/git/init", {
        method: "POST",
        headers: {
          "x-opencode-directory": tmp.path
        }
      });
      expect(init.status).toBe(200);
      expect(await init.json()).toMatchObject({
        vcs: "git",
        worktree: tmp.path
      });
      expect(disposedEvents(seen, tmp.path)).toBe(0);
      const current = await app.request("/project/current", {
        headers: {
          "x-opencode-directory": tmp.path
        }
      });
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({
        vcs: "git",
        worktree: tmp.path
      });
    } finally {
      await disposeAllInstances();
      GlobalBus.off("event", fn);
    }
  });
});