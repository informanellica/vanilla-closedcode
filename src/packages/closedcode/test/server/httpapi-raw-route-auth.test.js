import {  ConfigProvider, Layer  } from "effect"
import {  HttpRouter  } from "effect/unstable/http"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  EventPaths  } from "../../src/server/routes/instance/httpapi/event.js"
import {  PtyPaths  } from "../../src/server/routes/instance/httpapi/groups/pty.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  PtyID  } from "../../src/pty/schema.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
void Log.init({
  print: false
});
const originalHttpApi = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
function app(input) {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  const handler = HttpRouter.toWebHandler(ExperimentalHttpApiServer.routes.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
    CLOSEDCODE_SERVER_PASSWORD: input.password,
    CLOSEDCODE_SERVER_USERNAME: input.username
  })))), {
    disableLogger: true
  }).handler;
  return {
    fetch: request => handler(request, ExperimentalHttpApiServer.context),
    request(input, init) {
      return this.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init));
    }
  };
}
function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
async function cancelBody(response) {
  await response.body?.cancel().catch(() => {});
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi;
  await disposeAllInstances();
  await resetDatabase();
});
describe("HttpApi raw route authorization", () => {
  test("requires configured auth before opening the raw instance event stream", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const server = app({
      password: "secret"
    });
    const headers = {
      "x-opencode-directory": tmp.path
    };
    const missing = await server.request(EventPaths.event, {
      headers
    });
    await cancelBody(missing);
    expect(missing.status).toBe(401);
    const authed = await server.request(EventPaths.event, {
      headers: {
        ...headers,
        authorization: basic("closedcode", "secret")
      }
    });
    await cancelBody(authed);
    expect(authed.status).toBe(200);
  });
  test("requires configured auth before resolving the raw PTY websocket route", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const server = app({
      password: "secret"
    });
    const route = PtyPaths.connect.replace(":ptyID", PtyID.ascending());
    const headers = {
      "x-opencode-directory": tmp.path
    };
    const missing = await server.request(route, {
      headers
    });
    await cancelBody(missing);
    expect(missing.status).toBe(401);
    const authed = await server.request(route, {
      headers: {
        ...headers,
        authorization: basic("closedcode", "secret")
      }
    });
    await cancelBody(authed);
    expect(authed.status).toBe(404);
  });
});