import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  Server  } from "../../src/server/server.js"
import {  EventPaths  } from "../../src/server/routes/instance/httpapi/event.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
void Log.init({
  print: false
});
const original = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
function app(experimental = true) {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = experimental;
  return experimental ? Server.Default().app : Server.Legacy().app;
}
async function readFirstChunk(response) {
  if (!response.body) throw new Error("missing response body");
  const reader = response.body.getReader();
  const result = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for event")), 5_000))]);
  await reader.cancel();
  return new TextDecoder().decode(result.value);
}
async function readFirstEvent(response) {
  return JSON.parse((await readFirstChunk(response)).replace(/^data: /, ""));
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original;
  await disposeAllInstances();
  await resetDatabase();
});
describe("event HttpApi bridge", () => {
  test("serves event stream through experimental Effect route", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const response = await app().request(EventPaths.event, {
      headers: {
        "x-opencode-directory": tmp.path
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await readFirstEvent(response)).toMatchObject({
      type: "server.connected",
      properties: {}
    });
  });
  test("matches legacy first event frame", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false
      }
    });
    const headers = {
      "x-opencode-directory": tmp.path
    };
    const legacy = await app(false).request(EventPaths.event, {
      headers
    });
    const effect = await app(true).request(EventPaths.event, {
      headers
    });
    const legacyEvent = await readFirstEvent(legacy);
    const effectEvent = await readFirstEvent(effect);
    expect(effectEvent.type).toBe(legacyEvent.type);
    expect(effectEvent.properties).toEqual(legacyEvent.properties);
  });
});