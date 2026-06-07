import {  Effect, Layer  } from "effect"
import {  provideTmpdirInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  Auth  } from "../../src/auth/index.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  describe, expect, beforeAll  } from "@jest/globals"
const node = CrossSpawnSpawner.defaultLayer;
const it = testEffect(Layer.mergeAll(Auth.defaultLayer, node));
describe("Auth", () => {
  it.live("set normalizes trailing slashes in keys", () => provideTmpdirInstance(() => Effect.gen(function* () {
    const auth = yield* Auth.Service;
    yield* auth.set("https://example.com/", {
      type: "api",
      key: "abc"
    });
    const data = yield* auth.all();
    expect(data["https://example.com"]).toBeDefined();
    expect(data["https://example.com/"]).toBeUndefined();
  })));
  it.live("set cleans up pre-existing trailing-slash entry", () => provideTmpdirInstance(() => Effect.gen(function* () {
    const auth = yield* Auth.Service;
    yield* auth.set("https://example.com/", {
      type: "api",
      key: "old"
    });
    yield* auth.set("https://example.com", {
      type: "api",
      key: "new"
    });
    const data = yield* auth.all();
    const keys = Object.keys(data).filter(key => key.includes("example.com"));
    expect(keys).toEqual(["https://example.com"]);
    const entry = data["https://example.com"];
    expect(entry.type).toBe("api");
    if (entry.type === "api") expect(entry.key).toBe("new");
  })));
  it.live("remove deletes both trailing-slash and normalized keys", () => provideTmpdirInstance(() => Effect.gen(function* () {
    const auth = yield* Auth.Service;
    yield* auth.set("https://example.com", {
      type: "api",
      key: "abc"
    });
    yield* auth.remove("https://example.com/");
    const data = yield* auth.all();
    expect(data["https://example.com"]).toBeUndefined();
    expect(data["https://example.com/"]).toBeUndefined();
  })));
  it.live("set and remove are no-ops on keys without trailing slashes", () => provideTmpdirInstance(() => Effect.gen(function* () {
    const auth = yield* Auth.Service;
    yield* auth.set("anthropic", {
      type: "api",
      key: "sk-test"
    });
    const data = yield* auth.all();
    expect(data["anthropic"]).toBeDefined();
    yield* auth.remove("anthropic");
    const after = yield* auth.all();
    expect(after["anthropic"]).toBeUndefined();
  })));
});