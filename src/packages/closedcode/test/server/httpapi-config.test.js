import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  Server  } from "../../src/server/server.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
import {  waitGlobalBusEventPromise  } from "./global-bus.js"
import { readJson } from "../lib/io.js";

void Log.init({
  print: false
});
const original = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
function app() {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  return Server.Default().app;
}
async function waitDisposed(directory) {
  await waitGlobalBusEventPromise({
    message: "timed out waiting for instance disposal",
    predicate: event => event.payload.type === "server.instance.disposed" && event.directory === directory
  });
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original;
  await disposeAllInstances();
  await resetDatabase();
});
describe("config HttpApi", () => {
  test("serves config update through Express bridge", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false
      }
    });
    const disposed = waitDisposed(tmp.path);
    const response = await app().request("/config", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path
      },
      body: JSON.stringify({
        username: "patched-user",
        formatter: false,
        lsp: false
      })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      username: "patched-user",
      formatter: false,
      lsp: false
    });
    await disposed;
    expect(await readJson(path.join(tmp.path, "config.json"))).toMatchObject({
      username: "patched-user",
      formatter: false,
      lsp: false
    });
  });
});