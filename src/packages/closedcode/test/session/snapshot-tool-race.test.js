/**
 * Reproducer for snapshot race condition with instant tool execution.
 *
 * When the mock LLM returns a tool call response instantly, the AI SDK
 * processes the tool call and executes the tool (e.g. apply_patch) before
 * the processor's start-step handler can capture a pre-tool snapshot.
 * Both the "before" and "after" snapshots end up with the same git tree
 * hash, so computeDiff returns empty and the session summary shows 0 files.
 *
 * This is a real bug: the snapshot system assumes it can capture state
 * before tools run by hooking into start-step, but the AI SDK executes
 * tools internally during multi-step processing before emitting events.
 */
import {  Effect, Layer  } from "effect"
import {  FetchHttpClient  } from "effect/unstable/http"
import {  provideTmpdirServer  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  TestLLMServer  } from "../lib/llm-server.js"
import {  NodeFileSystem  } from "@effect/platform-node"
import {  Session  } from "#session/session.js"
import {  LLM  } from "../../src/session/llm.js"
import {  SessionPrompt  } from "../../src/session/prompt.js"
import {  SessionRevert  } from "../../src/session/revert.js"
import {  SessionSummary  } from "../../src/session/summary.js"
import {  MessageV2  } from "../../src/session/message-v2.js"
import * as Log from "core/util/log";
import {  Agent as AgentSvc  } from "../../src/agent/agent.js"
import {  Bus  } from "../../src/bus/index.js"
import {  Command  } from "../../src/command/index.js"
import {  Config  } from "#config/config.js"
import {  LSP  } from "#lsp/lsp.js"
import {  MCP  } from "../../src/mcp/index.js"
import {  Permission  } from "../../src/permission/index.js"
import {  Plugin  } from "../../src/plugin/index.js"
import {  Provider as ProviderSvc  } from "#provider/provider.js"
import {  Env  } from "../../src/env/index.js"
import {  Question  } from "../../src/question/index.js"
import {  Skill  } from "../../src/skill/index.js"
import {  SystemPrompt  } from "../../src/session/system.js"
import {  Todo  } from "../../src/session/todo.js"
import {  SessionCompaction  } from "../../src/session/compaction.js"
import {  Instruction  } from "../../src/session/instruction.js"
import {  SessionProcessor  } from "../../src/session/processor.js"
import {  SessionRunState  } from "../../src/session/run-state.js"
import {  SessionStatus  } from "../../src/session/status.js"
import {  Snapshot  } from "../../src/snapshot/index.js"
import {  ToolRegistry  } from "#tool/registry.js"
import {  Truncate  } from "#tool/truncate.js"
import {  AppFileSystem  } from "core/filesystem"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  Ripgrep  } from "../../src/file/ripgrep.js"
import {  Format  } from "../../src/format/index.js"
import {  expect, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
// Same layer setup as prompt-effect.test.ts

let AgentSvc;

let ProviderSvc;

void Log.init({
  print: false
});
const mcp = Layer.succeed(MCP.Service, MCP.Service.of({
  status: () => Effect.succeed({}),
  clients: () => Effect.succeed({}),
  tools: () => Effect.succeed({}),
  prompts: () => Effect.succeed({}),
  resources: () => Effect.succeed({}),
  add: () => Effect.succeed({
    status: {
      status: "disabled"
    }
  }),
  connect: () => Effect.void,
  disconnect: () => Effect.void,
  getPrompt: () => Effect.succeed(undefined),
  readResource: () => Effect.succeed(undefined),
  startAuth: () => Effect.die("unexpected MCP auth"),
  authenticate: () => Effect.die("unexpected MCP auth"),
  finishAuth: () => Effect.die("unexpected MCP auth"),
  removeAuth: () => Effect.void,
  supportsOAuth: () => Effect.succeed(false),
  hasStoredTokens: () => Effect.succeed(false),
  getAuthStatus: () => Effect.succeed("not_authenticated")
}));
const lsp = Layer.succeed(LSP.Service, LSP.Service.of({
  init: () => Effect.void,
  status: () => Effect.succeed([]),
  hasClients: () => Effect.succeed(false),
  touchFile: () => Effect.void,
  diagnostics: () => Effect.succeed({}),
  hover: () => Effect.succeed(undefined),
  definition: () => Effect.succeed([]),
  references: () => Effect.succeed([]),
  implementation: () => Effect.succeed([]),
  documentSymbol: () => Effect.succeed([]),
  workspaceSymbol: () => Effect.succeed([]),
  prepareCallHierarchy: () => Effect.succeed([]),
  incomingCalls: () => Effect.succeed([]),
  outgoingCalls: () => Effect.succeed([])
}));
const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer));
const run = SessionRunState.layer.pipe(Layer.provide(status));
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer);
function makeHttp() {
  const deps = Layer.mergeAll(Session.defaultLayer, Snapshot.defaultLayer, LLM.defaultLayer, Env.defaultLayer, AgentSvc.defaultLayer, Command.defaultLayer, Permission.defaultLayer, Plugin.defaultLayer, Config.defaultLayer, ProviderSvc.defaultLayer, lsp, mcp, AppFileSystem.defaultLayer, status).pipe(Layer.provideMerge(infra));
  const question = Question.layer.pipe(Layer.provideMerge(deps));
  const todo = Todo.layer.pipe(Layer.provideMerge(deps));
  const registry = ToolRegistry.layer.pipe(Layer.provide(Skill.defaultLayer), Layer.provide(FetchHttpClient.layer), Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(Ripgrep.defaultLayer), Layer.provide(Format.defaultLayer), Layer.provideMerge(todo), Layer.provideMerge(question), Layer.provideMerge(deps));
  const trunc = Truncate.layer.pipe(Layer.provideMerge(deps));
  const proc = SessionProcessor.layer.pipe(Layer.provide(SessionSummary.defaultLayer), Layer.provideMerge(deps));
  const compact = SessionCompaction.layer.pipe(Layer.provideMerge(proc), Layer.provideMerge(deps));
  return Layer.mergeAll(TestLLMServer.layer, SessionSummary.defaultLayer, SessionPrompt.layer.pipe(Layer.provide(SessionRevert.defaultLayer), Layer.provide(SessionSummary.defaultLayer), Layer.provideMerge(run), Layer.provideMerge(compact), Layer.provideMerge(proc), Layer.provideMerge(registry), Layer.provideMerge(trunc), Layer.provide(Instruction.defaultLayer), Layer.provide(SystemPrompt.defaultLayer), Layer.provideMerge(deps)));
}
const it = testEffect(makeHttp());
const providerCfg = url => ({
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: {
            context: 100000,
            output: 10000
          },
          cost: {
            input: 0,
            output: 0
          },
          options: {}
        }
      },
      options: {
        apiKey: "test-key",
        baseURL: url
      }
    }
  }
});
it.live("tool execution produces non-empty session diff (snapshot race)", () => provideTmpdirServer(Effect.fnUntraced(function* ({
  dir,
  llm
}) {
  const prompt = yield* SessionPrompt.Service;
  const sessions = yield* Session.Service;
  const summary = yield* SessionSummary.Service;
  const session = yield* sessions.create({
    title: "snapshot race test",
    permission: [{
      permission: "*",
      pattern: "*",
      action: "allow"
    }]
  });

  // Use bash tool (always registered) to create a file
  const command = `echo 'snapshot race test content' > ${path.join(dir, "race-test.txt")}`;
  yield* llm.toolMatch(hit => JSON.stringify(hit.body).includes("create the file"), "bash", {
    command,
    description: "create test file"
  });
  yield* llm.textMatch(hit => JSON.stringify(hit.body).includes("bash"), "done");

  // Seed user message
  yield* prompt.prompt({
    sessionID: session.id,
    agent: "build",
    noReply: true,
    parts: [{
      type: "text",
      text: "create the file"
    }]
  });

  // Run the agent loop
  const result = yield* prompt.loop({
    sessionID: session.id
  });
  expect(result.info.role).toBe("assistant");

  // Verify the file was created
  const filePath = path.join(dir, "race-test.txt");
  const fileExists = yield* Effect.promise(() => fs.access(filePath).then(() => true).catch(() => false));
  expect(fileExists).toBe(true);

  // Verify the tool call completed (in the first assistant message)
  const allMsgs = yield* MessageV2.filterCompactedEffect(session.id);
  const tool = allMsgs.flatMap(m => m.parts).find(p => p.type === "tool" && p.tool === "bash");
  expect(tool?.state.status).toBe("completed");

  // Poll for diff — summarize() is fire-and-forget
  let diff = [];
  for (let i = 0; i < 50; i++) {
    diff = yield* summary.diff({
      sessionID: session.id
    });
    if (diff.length > 0) break;
    yield* Effect.sleep("100 millis");
  }
  expect(diff.length).toBeGreaterThan(0);
}), {
  git: true,
  config: providerCfg
}));