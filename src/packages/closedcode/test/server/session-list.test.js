import {  Effect  } from "effect"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Session as SessionNs  } from "#session/session.js"
import * as Log from "core/util/log";
import {  Flag  } from "core/flag/flag"
import {  Database  } from "#storage/db.js"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"

import {  mkdir  } from "fs/promises"
import path from "path";
void Log.init({
  print: false
});
const originalWorkspaces = Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES;
function run(fx) {
  return Effect.runPromise(fx.pipe(Effect.provide(SessionNs.defaultLayer)));
}
const svc = {
  ...SessionNs,
  create(input) {
    return run(SessionNs.Service.use(svc => svc.create(input)));
  },
  list(input) {
    return run(SessionNs.Service.use(svc => svc.list(input)));
  }
};
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = originalWorkspaces;
  await disposeAllInstances();
});
describe("session.list", () => {
  test("does not filter by directory when directory is omitted", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = false;
    await using tmp = await tmpdir({
      git: true
    });
    await mkdir(path.join(tmp.path, "packages", "closedcode"), {
      recursive: true
    });
    await mkdir(path.join(tmp.path, "packages", "app"), {
      recursive: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const root = await svc.create({
          title: "root"
        });
        const parent = await WithInstance.provide({
          directory: path.join(tmp.path, "packages"),
          fn: async () => svc.create({
            title: "parent"
          })
        });
        const current = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode"),
          fn: async () => svc.create({
            title: "current"
          })
        });
        const sibling = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "app"),
          fn: async () => svc.create({
            title: "sibling"
          })
        });
        const ids = (await svc.list()).map(s => s.id);
        expect(ids).toContain(root.id);
        expect(ids).toContain(parent.id);
        expect(ids).toContain(current.id);
        expect(ids).toContain(sibling.id);
      }
    });
  });
  test("filters by directory when directory is provided", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = false;
    await using tmp = await tmpdir({
      git: true
    });
    await mkdir(path.join(tmp.path, "packages", "closedcode"), {
      recursive: true
    });
    await mkdir(path.join(tmp.path, "packages", "app"), {
      recursive: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const root = await svc.create({
          title: "root"
        });
        const parent = await WithInstance.provide({
          directory: path.join(tmp.path, "packages"),
          fn: async () => svc.create({
            title: "parent"
          })
        });
        const current = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode"),
          fn: async () => svc.create({
            title: "current"
          })
        });
        const sibling = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "app"),
          fn: async () => svc.create({
            title: "sibling"
          })
        });
        const ids = (await svc.list({
          directory: path.join(tmp.path, "packages", "closedcode")
        })).map(s => s.id);
        expect(ids).not.toContain(root.id);
        expect(ids).not.toContain(parent.id);
        expect(ids).toContain(current.id);
        expect(ids).not.toContain(sibling.id);
      }
    });
  });
  test("filters by path and ignores directory when path is provided", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = false;
    await using tmp = await tmpdir({
      git: true
    });
    await mkdir(path.join(tmp.path, "packages", "closedcode", "src", "deep"), {
      recursive: true
    });
    await mkdir(path.join(tmp.path, "packages", "app"), {
      recursive: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode"),
          fn: async () => svc.create({
            title: "parent"
          })
        });
        const current = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode", "src"),
          fn: async () => svc.create({
            title: "current"
          })
        });
        const deeper = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode", "src", "deep"),
          fn: async () => svc.create({
            title: "deeper"
          })
        });
        const sibling = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "app"),
          fn: async () => svc.create({
            title: "sibling"
          })
        });
        const pathIDs = (await svc.list({
          directory: path.join(tmp.path, "packages", "app"),
          path: "packages/closedcode/src"
        })).map(s => s.id);
        expect(pathIDs).not.toContain(parent.id);
        expect(pathIDs).toContain(current.id);
        expect(pathIDs).toContain(deeper.id);
        expect(pathIDs).not.toContain(sibling.id);
      }
    });
  });
  test("falls back to directory when filtering legacy sessions without path", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = false;
    await using tmp = await tmpdir({
      git: true
    });
    await mkdir(path.join(tmp.path, "packages", "closedcode", "src"), {
      recursive: true
    });
    await mkdir(path.join(tmp.path, "packages", "app"), {
      recursive: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const current = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "closedcode", "src"),
          fn: async () => svc.create({
            title: "legacy-current"
          })
        });
        const sibling = await WithInstance.provide({
          directory: path.join(tmp.path, "packages", "app"),
          fn: async () => svc.create({
            title: "legacy-sibling"
          })
        });
        await Database.useAsync(h => h.models.Session.update({ path: null }, { where: { id: current.id }, transaction: h.tx }));
        await Database.useAsync(h => h.models.Session.update({ path: null }, { where: { id: sibling.id }, transaction: h.tx }));
        const pathIDs = (await svc.list({
          directory: path.join(tmp.path, "packages", "closedcode", "src"),
          path: "packages/closedcode/src"
        })).map(s => s.id);
        expect(pathIDs).toContain(current.id);
        expect(pathIDs).not.toContain(sibling.id);
      }
    });
  });
  test("filters root sessions", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const root = await svc.create({
          title: "root-session"
        });
        const child = await svc.create({
          title: "child-session",
          parentID: root.id
        });
        const sessions = await svc.list({
          roots: true
        });
        const ids = sessions.map(s => s.id);
        expect(ids).toContain(root.id);
        expect(ids).not.toContain(child.id);
      }
    });
  });
  test("filters by start time", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await svc.create({
          title: "new-session"
        });
        const futureStart = Date.now() + 86400000;
        const sessions = await svc.list({
          start: futureStart
        });
        expect(sessions.length).toBe(0);
      }
    });
  });
  test("filters by search term", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await svc.create({
          title: "unique-search-term-abc"
        });
        await svc.create({
          title: "other-session-xyz"
        });
        const sessions = await svc.list({
          search: "unique-search"
        });
        const titles = sessions.map(s => s.title);
        expect(titles).toContain("unique-search-term-abc");
        expect(titles).not.toContain("other-session-xyz");
      }
    });
  });
  test("respects limit parameter", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await svc.create({
          title: "session-1"
        });
        await svc.create({
          title: "session-2"
        });
        await svc.create({
          title: "session-3"
        });
        const sessions = await svc.list({
          limit: 2
        });
        expect(sessions.length).toBe(2);
      }
    });
  });
});