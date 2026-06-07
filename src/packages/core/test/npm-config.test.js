import {  Effect  } from "effect"
import {  tmpdir  } from "./fixture/tmpdir.js"
import {  NpmConfig  } from "core/npm-config"
import path from "path";
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import * as __fs__ from "node:fs/promises";
async function __bunWriteShim__(p, c) {
  await __fs__.mkdir(path.dirname(p), { recursive: true });
  await __fs__.writeFile(p, c);
}

describe("NpmConfig.load", () => {
  test("reads registry from project .npmrc", async () => {
    await using tmp = await tmpdir();
    await __bunWriteShim__(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test/\n");
    const config = await Effect.runPromise(NpmConfig.load(tmp.path));
    expect(config.registry).toBe("https://registry.example.test/");
  });
  test("reads scoped registries from project .npmrc", async () => {
    await using tmp = await tmpdir();
    await __bunWriteShim__(path.join(tmp.path, ".npmrc"), "@acme:registry=https://npm.acme.test/\n");
    const config = await Effect.runPromise(NpmConfig.load(tmp.path));
    expect(config["@acme:registry"]).toBe("https://npm.acme.test/");
  });
  test("flattens boolean and list options", async () => {
    await using tmp = await tmpdir();
    await __bunWriteShim__(path.join(tmp.path, ".npmrc"), "ignore-scripts=true\nomit[]=dev\nomit[]=optional\n");
    const config = await Effect.runPromise(NpmConfig.load(tmp.path));
    expect(config.ignoreScripts).toBe(true);
    expect(config.omit).toEqual(["dev", "optional"]);
  });
});
describe("NpmConfig.registry", () => {
  test("normalizes configured registry without trailing slash", async () => {
    await using tmp = await tmpdir();
    await __bunWriteShim__(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test/\n");
    await expect(Effect.runPromise(NpmConfig.registry(tmp.path))).resolves.toBe("https://registry.example.test");
  });
  test("leaves configured registry without trailing slash unchanged", async () => {
    await using tmp = await tmpdir();
    await __bunWriteShim__(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test\n");
    await expect(Effect.runPromise(NpmConfig.registry(tmp.path))).resolves.toBe("https://registry.example.test");
  });
});