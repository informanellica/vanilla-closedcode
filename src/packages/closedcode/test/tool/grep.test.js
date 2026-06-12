import {  Effect, Layer  } from "effect"
import {  provideInstance, TestInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  GrepTool  } from "../../src/tool/grep.js"
import {  SessionID, MessageID  } from "../../src/session/schema.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  Truncate  } from "#tool/truncate.js"
import {  Agent  } from "../../src/agent/agent.js"
import {  Ripgrep  } from "../../src/file/ripgrep.js"
import {  AppFileSystem  } from "core/filesystem"
import {  describe, expect, beforeAll  } from "@jest/globals"
import path from "path";
import { writeFile } from "../lib/io.js";
import { fileURLToPath as __toPath } from "node:url";
const __dirname = path.dirname(__toPath(import.meta.url));


const it = testEffect(Layer.mergeAll(CrossSpawnSpawner.defaultLayer, AppFileSystem.defaultLayer, Ripgrep.defaultLayer, Truncate.defaultLayer, Agent.defaultLayer));
const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void
};
const root = path.join(__dirname, "../..");
describe("tool.grep", () => {
  it.live("basic search", () => Effect.gen(function* () {
    const info = yield* GrepTool;
    const grep = yield* info.init();
    const result = yield* provideInstance(root)(grep.execute({
      pattern: "export",
      path: path.join(root, "src/tool"),
      include: "*.ts"
    }, ctx));
    expect(result.metadata.matches).toBeGreaterThan(0);
    expect(result.output).toContain("Found");
  }));
  it.instance("no matches returns correct output", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    yield* Effect.promise(() => writeFile(path.join(test.directory, "test.txt"), "hello world"));
    const info = yield* GrepTool;
    const grep = yield* info.init();
    const result = yield* grep.execute({
      pattern: "xyznonexistentpatternxyz123",
      path: test.directory
    }, ctx);
    expect(result.metadata.matches).toBe(0);
    expect(result.output).toBe("No files found");
  }));
  it.instance("finds matches in tmp instance", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    yield* Effect.promise(() => writeFile(path.join(test.directory, "test.txt"), "line1\nline2\nline3"));
    const info = yield* GrepTool;
    const grep = yield* info.init();
    const result = yield* grep.execute({
      pattern: "line",
      path: test.directory
    }, ctx);
    expect(result.metadata.matches).toBeGreaterThan(0);
  }));
  it.instance("supports exact file paths", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    const file = path.join(test.directory, "test.txt");
    yield* Effect.promise(() => writeFile(file, "line1\nline2\nline3"));
    const info = yield* GrepTool;
    const grep = yield* info.init();
    const result = yield* grep.execute({
      pattern: "line2",
      path: file
    }, ctx);
    expect(result.metadata.matches).toBe(1);
    expect(result.output).toContain(file);
    expect(result.output).toContain("Line 2: line2");
  }));
});