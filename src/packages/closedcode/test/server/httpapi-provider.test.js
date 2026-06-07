import {  Effect, FileSystem, Layer, Path  } from "effect"
import {  NodeFileSystem, NodePath  } from "@effect/platform-node"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, provideInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  Flag  } from "core/flag/flag"
import {  Instance  } from "../../src/project/instance.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  InstanceRuntime  } from "../../src/project/instance-runtime.js"
import {  Server  } from "../../src/server/server.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, beforeAll  } from "@jest/globals"
void Log.init({
  print: false
});
const original = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
const it = testEffect(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer));
const providerID = "test-oauth-parity";
const oauthURL = "https://example.com/oauth";
const oauthInstructions = "Finish OAuth";
function app(experimental) {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = experimental;
  return experimental ? Server.Default().app : Server.Legacy().app;
}
function requestAuthorize(input) {
  return Effect.promise(async () => {
    const response = await input.app.request(`/provider/${input.providerID}/oauth/authorize`, {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify({
        method: input.method
      })
    });
    return {
      status: response.status,
      body: await response.text()
    };
  });
}
function writeProviderAuthPlugin(dir) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(dir, ".opencode", "plugin"), {
      recursive: true
    });
    yield* fs.writeFileString(path.join(dir, ".opencode", "plugin", "provider-oauth-parity.mjs"), ["export default {", '  id: "test.provider-oauth-parity",', "  server: async () => ({", "    auth: {", `      provider: "${providerID}",`, "      methods: [", '        { type: "api", label: "API key" },', "        {", '          type: "oauth",', '          label: "OAuth",', "          authorize: async () => ({", `            url: "${oauthURL}",`, '            method: "code",', `            instructions: "${oauthInstructions}",`, "            callback: async () => ({ type: 'success', key: 'token' }),", "          }),", "        },", "      ],", "    },", "  }),", "}", ""].join("\n"));
  });
}
function withProviderProject(self) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({
      prefix: "closedcode-test-"
    });
    yield* fs.writeFileString(path.join(dir, "opencode.json"), JSON.stringify({
      formatter: false,
      lsp: false
    }));
    yield* writeProviderAuthPlugin(dir);
    yield* Effect.addFinalizer(() => Effect.promise(() => WithInstance.provide({
      directory: dir,
      fn: () => InstanceRuntime.disposeInstance(Instance.current)
    })).pipe(Effect.ignore));
    return yield* self(dir).pipe(provideInstance(dir));
  });
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original;
  await disposeAllInstances();
  await resetDatabase();
});
describe("provider HttpApi", () => {
  it.live("matches legacy OAuth authorize response shapes", withProviderProject(dir => Effect.gen(function* () {
    const headers = {
      "x-opencode-directory": dir,
      "content-type": "application/json"
    };
    const legacy = app(false);
    const httpapi = app(true);
    const apiLegacy = yield* requestAuthorize({
      app: legacy,
      providerID,
      method: 0,
      headers
    });
    const apiHttpApi = yield* requestAuthorize({
      app: httpapi,
      providerID,
      method: 0,
      headers
    });
    expect(apiLegacy).toEqual({
      status: 200,
      body: ""
    });
    expect(apiHttpApi).toEqual(apiLegacy);
    const oauthLegacy = yield* requestAuthorize({
      app: legacy,
      providerID,
      method: 1,
      headers
    });
    const oauthHttpApi = yield* requestAuthorize({
      app: httpapi,
      providerID,
      method: 1,
      headers
    });
    expect(oauthHttpApi).toEqual(oauthLegacy);
    expect(JSON.parse(oauthHttpApi.body)).toEqual({
      url: oauthURL,
      method: "code",
      instructions: oauthInstructions
    });
  })));
});