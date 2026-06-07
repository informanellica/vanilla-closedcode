import {  Effect  } from "effect"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Server  } from "../../src/server/server.js"
import {  Session as SessionNs  } from "@/session/session.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll, jest  } from "@jest/globals"

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
  }
};
afterEach(async () => {
  jest.restoreAllMocks();
  await disposeAllInstances();
});
describe("session action routes", () => {
  test("abort route returns success", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({});
        const app = Server.Default().app;
        const res = await app.request(`/session/${session.id}/abort`, {
          method: "POST"
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toBe(true);
        await svc.remove(session.id);
      }
    });
  });
});