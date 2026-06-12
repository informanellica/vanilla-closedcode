import {  Effect  } from "effect"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Session as SessionNs  } from "#session/session.js"
import * as Log from "core/util/log";
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Server  } from "../../src/server/server.js"
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
  }
};
afterEach(async () => {
  await disposeAllInstances();
});
describe("tui.selectSession endpoint", () => {
  test("should return 200 when called with valid session", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        // #given
        const session = await svc.create({});

        // #when
        const app = Server.Default().app;
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionID: session.id
          })
        });

        // #then
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toBe(true);
        await svc.remove(session.id);
      }
    });
  });
  test("should return 404 when session does not exist", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        // #given
        const nonExistentSessionID = "ses_nonexistent123";

        // #when
        const app = Server.Default().app;
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionID: nonExistentSessionID
          })
        });

        // #then
        expect(response.status).toBe(404);
      }
    });
  });
  test("should return 400 when session ID format is invalid", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        // #given
        const invalidSessionID = "invalid_session_id";

        // #when
        const app = Server.Default().app;
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionID: invalidSessionID
          })
        });

        // #then
        expect(response.status).toBe(400);
      }
    });
  });
});