import {  Effect  } from "effect"
import {  tmpdir  } from "../fixture/fixture.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  Bus  } from "../../src/bus/index.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Pty  } from "../../src/pty/index.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import {  setTimeout as sleep  } from "node:timers/promises"
const wait = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(25);
  }
  throw new Error("timeout waiting for pty events");
};
const pick = (log, id) => {
  return log.filter(evt => evt.id === id).map(evt => evt.type);
};
describe("pty", () => {
  test("publishes created, exited, deleted in order for a short-lived process", async () => {
    if (process.platform === "win32") return;
    await using dir = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: dir.path,
      fn: () => AppRuntime.runPromise(Effect.gen(function* () {
        const pty = yield* Pty.Service;
        const log = [];
        const off = [Bus.subscribe(Pty.Event.Created, evt => log.push({
          type: "created",
          id: evt.properties.info.id
        })), Bus.subscribe(Pty.Event.Exited, evt => log.push({
          type: "exited",
          id: evt.properties.id
        })), Bus.subscribe(Pty.Event.Deleted, evt => log.push({
          type: "deleted",
          id: evt.properties.id
        }))];
        let id;
        try {
          const info = yield* pty.create({
            command: "/usr/bin/env",
            args: ["sh", "-c", "sleep 0.1"],
            title: "sleep"
          });
          id = info.id;
          yield* Effect.promise(() => wait(() => pick(log, id).includes("exited")));
          yield* pty.remove(id);
          yield* Effect.promise(() => wait(() => pick(log, id).length >= 3));
          expect(pick(log, id)).toEqual(["created", "exited", "deleted"]);
        } finally {
          off.forEach(x => x());
          if (id) yield* pty.remove(id);
        }
      }))
    });
  });
  test("publishes created, exited, deleted in order for /bin/sh + remove", async () => {
    if (process.platform === "win32") return;
    await using dir = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: dir.path,
      fn: () => AppRuntime.runPromise(Effect.gen(function* () {
        const pty = yield* Pty.Service;
        const log = [];
        const off = [Bus.subscribe(Pty.Event.Created, evt => log.push({
          type: "created",
          id: evt.properties.info.id
        })), Bus.subscribe(Pty.Event.Exited, evt => log.push({
          type: "exited",
          id: evt.properties.id
        })), Bus.subscribe(Pty.Event.Deleted, evt => log.push({
          type: "deleted",
          id: evt.properties.id
        }))];
        let id;
        try {
          const info = yield* pty.create({
            command: "/bin/sh",
            title: "sh"
          });
          id = info.id;
          yield* Effect.promise(() => sleep(100));
          yield* pty.remove(id);
          yield* Effect.promise(() => wait(() => pick(log, id).length >= 3));
          expect(pick(log, id)).toEqual(["created", "exited", "deleted"]);
        } finally {
          off.forEach(x => x());
          if (id) yield* pty.remove(id);
        }
      }))
    });
  });
});