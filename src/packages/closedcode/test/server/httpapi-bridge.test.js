import {  ConfigProvider, Layer  } from "effect"
import {  HttpRouter  } from "effect/unstable/http"
import {  OpenApi  } from "effect/unstable/httpapi"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Flag  } from "core/flag/flag"
import {  ControlPaths  } from "../../src/server/routes/instance/httpapi/groups/control.js"
import {  FilePaths  } from "../../src/server/routes/instance/httpapi/groups/file.js"
import {  GlobalPaths  } from "../../src/server/routes/instance/httpapi/groups/global.js"
import {  PublicApi  } from "../../src/server/routes/instance/httpapi/public.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  Server  } from "../../src/server/server.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import { writeFile } from "../lib/io.js";

void Log.init({
  print: false
});
const original = {
  CLOSEDCODE_EXPERIMENTAL_HTTPAPI: Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI,
  CLOSEDCODE_SERVER_PASSWORD: Flag.CLOSEDCODE_SERVER_PASSWORD,
  CLOSEDCODE_SERVER_USERNAME: Flag.CLOSEDCODE_SERVER_USERNAME
};
const methods = ["get", "post", "put", "delete", "patch"];
let effectSpec;
function effectOpenApi() {
  return effectSpec ??= OpenApi.fromApi(PublicApi);
}
function app(input) {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  Flag.CLOSEDCODE_SERVER_PASSWORD = input?.password;
  Flag.CLOSEDCODE_SERVER_USERNAME = input?.username;
  const handler = HttpRouter.toWebHandler(ExperimentalHttpApiServer.routes.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
    CLOSEDCODE_SERVER_PASSWORD: input?.password,
    CLOSEDCODE_SERVER_USERNAME: input?.username
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
function openApiRouteKeys(spec) {
  return Object.entries(spec.paths).flatMap(([path, item]) => methods.filter(method => item[method]).map(method => `${method.toUpperCase()} ${path}`)).sort();
}
function openApiParameters(spec) {
  return Object.fromEntries(Object.entries(spec.paths).flatMap(([path, item]) => methods.filter(method => item[method]).map(method => [`${method.toUpperCase()} ${path}`, (item[method]?.parameters ?? []).map(parameterKey).filter(param => param !== undefined).sort()])));
}
function openApiRequestBodies(spec) {
  return Object.fromEntries(Object.entries(spec.paths).flatMap(([path, item]) => methods.filter(method => item[method]).map(method => [`${method.toUpperCase()} ${path}`, requestBodyKey(spec, item[method]?.requestBody)])));
}
function parameterKey(param) {
  if (!param || typeof param !== "object" || !("in" in param) || !("name" in param)) return undefined;
  if (typeof param.in !== "string" || typeof param.name !== "string") return undefined;
  return `${param.in}:${param.name}:${"required" in param && param.required === true}:${stableSchema("schema" in param ? param.schema : undefined)}`;
}
function stableSchema(input) {
  return JSON.stringify(sortSchema(input));
}
function sortSchema(input) {
  if (Array.isArray(input)) return input.map(sortSchema);
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, sortSchema(value)]));
}
function parameterSchema(input) {
  const param = input.spec.paths[input.path]?.[input.method]?.parameters?.find(param => !!param && typeof param === "object" && "name" in param && param.name === input.name);
  if (!param || typeof param !== "object" || !("schema" in param)) return undefined;
  return param.schema;
}
function requestBodyKey(spec, body) {
  if (!body || typeof body !== "object" || !("content" in body)) return "";
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Guarded above; test helper only needs this OpenAPI subset.
  const requestBody = body;
  return JSON.stringify({
    required: requestBody.required === true,
    content: Object.entries(requestBody.content ?? {}).map(([type, value]) => [type, requestBodySchemaKind(spec, value.schema)]).sort(([left], [right]) => left.localeCompare(right))
  });
}
function requestBodySchemaKind(spec, schema) {
  if (!schema) return "";
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- `$ref` lookup is constrained to OpenAPI schema components in this test helper.
  const resolved = schema.$ref ? spec.components?.schemas?.[schema.$ref.replace("#/components/schemas/", "")] : schema;
  if (resolved?.properties) return "object";
  if (resolved?.anyOf ?? resolved?.oneOf ?? resolved?.allOf) return "object";
  return resolved?.type ?? schema.type ?? "inline";
}
function responseContentTypes(input) {
  const responses = input.spec.paths[input.path]?.[input.method]?.responses;
  if (!responses || typeof responses !== "object" || !(input.status in responses)) return [];
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Guarded dynamic OpenAPI response lookup.
  const response = responses[input.status];
  if (!response || typeof response !== "object" || !("content" in response)) return [];
  const content = response.content;
  if (!content || typeof content !== "object") {
    return [];
  }
  return Object.keys(content).sort();
}
function authorization(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
function fileUrl(input) {
  const url = new URL(`http://localhost${FilePaths.content}`);
  url.searchParams.set("path", "hello.txt");
  if (input?.directory) url.searchParams.set("directory", input.directory);
  if (input?.token) url.searchParams.set("auth_token", input.token);
  return url;
}
afterEach(async () => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
  Flag.CLOSEDCODE_SERVER_PASSWORD = original.CLOSEDCODE_SERVER_PASSWORD;
  Flag.CLOSEDCODE_SERVER_USERNAME = original.CLOSEDCODE_SERVER_USERNAME;
  await disposeAllInstances();
  await resetDatabase();
});
describe("HttpApi server", () => {
  test("always selects the express backend", () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = false;
    expect(Server.backend()).toEqual({
      backend: "express",
      reason: "stable"
    });
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    expect(Server.backend()).toEqual({
      backend: "express",
      reason: "stable"
    });
  });
  test("covers every generated OpenAPI route with Effect HttpApi contracts", async () => {
    const expressRoutes = openApiRouteKeys(await Server.openapi());
    const effectRoutes = openApiRouteKeys(effectOpenApi());
    expect(expressRoutes.filter(route => !effectRoutes.includes(route))).toEqual([]);
    expect(effectRoutes.filter(route => !expressRoutes.includes(route))).toEqual(["GET /api/session", "GET /api/session/{sessionID}/context", "GET /api/session/{sessionID}/message", "POST /api/session/{sessionID}/compact", "POST /api/session/{sessionID}/prompt", "POST /api/session/{sessionID}/wait"]);
  });
  test("matches generated OpenAPI route parameters", async () => {
    const base = openApiParameters(await Server.openapi());
    const effect = openApiParameters(effectOpenApi());
    expect(Object.keys(base).filter(route => JSON.stringify(base[route]) !== JSON.stringify(effect[route])).map(route => ({
      route,
      base: base[route],
      effect: effect[route]
    }))).toEqual([]);
  });
  test("matches generated OpenAPI request body shape", async () => {
    const base = openApiRequestBodies(await Server.openapi());
    const effect = openApiRequestBodies(effectOpenApi());
    expect(Object.keys(base).filter(route => base[route] !== effect[route]).map(route => ({
      route,
      base: base[route],
      effect: effect[route]
    }))).toEqual([]);
  });
  test("matches SDK-affecting query parameter schemas", async () => {
    const effect = effectOpenApi();
    expect(parameterSchema({
      spec: effect,
      path: "/session",
      method: "get",
      name: "roots"
    })).toEqual({
      anyOf: [{
        type: "boolean"
      }, {
        type: "string",
        enum: ["true", "false"]
      }]
    });
    expect(parameterSchema({
      spec: effect,
      path: "/session",
      method: "get",
      name: "start"
    })).toEqual({
      type: "number"
    });
    expect(parameterSchema({
      spec: effect,
      path: "/find/file",
      method: "get",
      name: "limit"
    })).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 200
    });
    expect(parameterSchema({
      spec: effect,
      path: "/session/{sessionID}/message",
      method: "get",
      name: "limit"
    })).toEqual({
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER
    });
  });
  test("matches SDK-affecting request schema details", () => {
    const effect = effectOpenApi();
    const sessionUpdate = effect.paths["/session/{sessionID}"]?.patch?.requestBody;
    const sessionUpdateSchema = typeof sessionUpdate === "object" && sessionUpdate && "content" in sessionUpdate ? sessionUpdate.content?.["application/json"]?.schema : undefined;
    const sessionUpdateProperties = sessionUpdateSchema?.properties;
    const time = sessionUpdateProperties?.time;
    expect(time?.properties?.archived).toEqual({
      type: "number"
    });
  });
  test("documents event routes as server-sent events", () => {
    const effect = effectOpenApi();
    expect(responseContentTypes({
      spec: effect,
      path: "/event",
      method: "get",
      status: "200"
    })).toEqual(["text/event-stream"]);
    expect(responseContentTypes({
      spec: effect,
      path: "/global/event",
      method: "get",
      status: "200"
    })).toEqual(["text/event-stream"]);
  });
  test("allows requests when auth is disabled", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await writeFile(`${tmp.path}/hello.txt`, "hello");
    const response = await app().request(fileUrl(), {
      headers: {
        "x-opencode-directory": tmp.path
      }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: "hello"
    });
  });
  test("provides instance context to bridged handlers", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const response = await app().request("/project/current", {
      headers: {
        "x-opencode-directory": tmp.path
      }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      worktree: tmp.path
    });
  });
  test("requires credentials when auth is enabled", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await writeFile(`${tmp.path}/hello.txt`, "hello");
    const [missing, bad, good] = await Promise.all([app({
      password: "secret"
    }).request(fileUrl(), {
      headers: {
        "x-opencode-directory": tmp.path
      }
    }), app({
      password: "secret"
    }).request(fileUrl(), {
      headers: {
        authorization: authorization("closedcode", "wrong"),
        "x-opencode-directory": tmp.path
      }
    }), app({
      password: "secret"
    }).request(fileUrl(), {
      headers: {
        authorization: authorization("closedcode", "secret"),
        "x-opencode-directory": tmp.path
      }
    })]);
    expect(missing.status).toBe(401);
    expect(bad.status).toBe(401);
    expect(good.status).toBe(200);
  });
  test("accepts auth_token query credentials", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await writeFile(`${tmp.path}/hello.txt`, "hello");
    const response = await app({
      password: "secret"
    }).request(fileUrl({
      token: Buffer.from("closedcode:secret").toString("base64")
    }), {
      headers: {
        "x-opencode-directory": tmp.path
      }
    });
    expect(response.status).toBe(200);
  });
  test("selects instance from query before directory header", async () => {
    await using header = await tmpdir({
      git: true
    });
    await using query = await tmpdir({
      git: true
    });
    await writeFile(`${header.path}/hello.txt`, "header");
    await writeFile(`${query.path}/hello.txt`, "query");
    const response = await app().request(fileUrl({
      directory: query.path
    }), {
      headers: {
        "x-opencode-directory": header.path
      }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: "query"
    });
  });
  test("serves global health from Effect HttpApi", async () => {
    const response = await app().request(`${GlobalPaths.health}?directory=/does/not/exist/closedcode-test`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      healthy: true
    });
  });
  test("serves global event stream from Effect HttpApi", async () => {
    const response = await app().request(GlobalPaths.event);
    if (!response.body) throw new Error("missing event stream body");
    const reader = response.body.getReader();
    const chunk = await reader.read();
    await reader.cancel();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(new TextDecoder().decode(chunk.value)).toContain("server.connected");
  });
  test("serves control log from Effect HttpApi", async () => {
    const response = await app().request(ControlPaths.log, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        service: "httpapi-test",
        level: "info",
        message: "hello"
      })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toBe(true);
  });
  test("validates control auth without falling through to 404", async () => {
    const response = await app().request(ControlPaths.auth.replace(":providerID", "test"), {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        type: "api"
      })
    });
    expect(response.status).toBe(400);
  });
  test("validates global upgrade without invoking installers", async () => {
    const response = await app().request(GlobalPaths.upgrade, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: "not-json"
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false
    });
  });
});