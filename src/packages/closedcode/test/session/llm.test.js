import {  tool  } from "ai"
import {  Cause, Effect, Exit, Stream  } from "effect"
import {  default as z  } from "zod"
import {  nodeFetchServer  } from "../fixture/node-fetch-server.js"
import {  tmpdir  } from "../fixture/fixture.js"
import {  makeRuntime  } from "../../src/effect/run-service.js"
import {  LLM  } from "../../src/session/llm.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Provider  } from "@/provider/provider.js"
import {  ProviderTransform  } from "@/provider/transform.js"
import {  ProviderID, ModelID  } from "../../src/provider/schema.js"
import {  Filesystem  } from "@/util/filesystem.js"
import {  MessageV2  } from "../../src/session/message-v2.js"
import {  SessionID, MessageID  } from "../../src/session/schema.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  afterAll, beforeAll, beforeEach, describe, expect, test  } from "@jest/globals"
import path from "path";
import { writeFile } from "../lib/io.js";
import { fileURLToPath as __toPath } from "node:url";
const __dirname = path.dirname(__toPath(import.meta.url));


async function getModel(providerID, modelID) {
  return AppRuntime.runPromise(Effect.gen(function* () {
    const provider = yield* Provider.Service;
    return yield* provider.getModel(providerID, modelID);
  }));
}
const llm = makeRuntime(LLM.Service, LLM.defaultLayer);
async function drain(input) {
  return llm.runPromise(svc => svc.stream(input).pipe(Stream.runDrain));
}
describe("session.llm.hasToolCalls", () => {
  test("returns false for empty messages array", () => {
    expect(LLM.hasToolCalls([])).toBe(false);
  });
  test("returns false for messages with only text content", () => {
    const messages = [{
      role: "user",
      content: [{
        type: "text",
        text: "Hello"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "Hi there"
      }]
    }];
    expect(LLM.hasToolCalls(messages)).toBe(false);
  });
  test("returns true when messages contain tool-call", () => {
    const messages = [{
      role: "user",
      content: [{
        type: "text",
        text: "Run a command"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "call-123",
        toolName: "bash"
      }]
    }];
    expect(LLM.hasToolCalls(messages)).toBe(true);
  });
  test("returns true when messages contain tool-result", () => {
    const messages = [{
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "call-123",
        toolName: "bash"
      }]
    }];
    expect(LLM.hasToolCalls(messages)).toBe(true);
  });
  test("returns false for messages with string content", () => {
    const messages = [{
      role: "user",
      content: "Hello world"
    }, {
      role: "assistant",
      content: "Hi there"
    }];
    expect(LLM.hasToolCalls(messages)).toBe(false);
  });
  test("returns true when tool-call is mixed with text content", () => {
    const messages = [{
      role: "assistant",
      content: [{
        type: "text",
        text: "Let me run that command"
      }, {
        type: "tool-call",
        toolCallId: "call-456",
        toolName: "read"
      }]
    }];
    expect(LLM.hasToolCalls(messages)).toBe(true);
  });
});
const state = {
  server: null,
  queue: []
};
function deferred() {
  const result = {};
  result.promise = new Promise(resolve => {
    result.resolve = resolve;
  });
  return result;
}
function waitRequest(pathname, response) {
  const pending = deferred();
  state.queue.push({
    path: pathname,
    response,
    resolve: pending.resolve
  });
  return pending.promise;
}
function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
}
function waitStreamingRequest(pathname) {
  const request = deferred();
  const requestAborted = deferred();
  const responseCanceled = deferred();
  const encoder = new TextEncoder();
  state.queue.push({
    path: pathname,
    resolve: request.resolve,
    response(req) {
      req.signal.addEventListener("abort", () => requestAborted.resolve(), {
        once: true
      });
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([`data: ${JSON.stringify({
            id: "chatcmpl-abort",
            object: "chat.completion.chunk",
            choices: [{
              delta: {
                role: "assistant"
              }
            }]
          })}`].join("\n\n") + "\n\n"));
        },
        cancel() {
          responseCanceled.resolve();
        }
      }), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    }
  });
  return {
    request: request.promise,
    requestAborted: requestAborted.promise,
    responseCanceled: responseCanceled.promise
  };
}
beforeAll(async () => {
  state.server = await nodeFetchServer({
    port: 0,
    async fetch(req) {
      const next = state.queue.shift();
      if (!next) {
        return new Response("unexpected request", { status: 500 });
      }
      const url = new URL(req.url);
      const body = await req.json();
      next.resolve({ url, headers: req.headers, body });
      if (!url.pathname.endsWith(next.path)) {
        return new Response("not found", { status: 404 });
      }
      return typeof next.response === "function" ? next.response(req, { url, headers: req.headers, body }) : next.response;
    }
  });
});
beforeEach(() => {
  state.queue.length = 0;
});
afterAll(() => {
  void state.server?.stop();
});
function createChatStream(text) {
  const payload = [`data: ${JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    choices: [{
      delta: {
        role: "assistant"
      }
    }]
  })}`, `data: ${JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    choices: [{
      delta: {
        content: text
      }
    }]
  })}`, `data: ${JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    choices: [{
      delta: {},
      finish_reason: "stop"
    }]
  })}`, "data: [DONE]"].join("\n\n") + "\n\n";
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    }
  });
}
async function loadFixture(providerID, modelID) {
  const fixturePath = path.join(__dirname, "../tool/fixtures/models-api.json");
  const data = await Filesystem.readJson(fixturePath);
  const provider = data[providerID];
  if (!provider) {
    throw new Error(`Missing provider in fixture: ${providerID}`);
  }
  const model = provider.models[modelID];
  if (!model) {
    throw new Error(`Missing model in fixture: ${modelID}`);
  }
  return {
    provider,
    model
  };
}
function createEventStream(chunks, includeDone = false) {
  const lines = chunks.map(chunk => `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}`);
  if (includeDone) {
    lines.push("data: [DONE]");
  }
  const payload = lines.join("\n\n") + "\n\n";
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    }
  });
}
function createEventResponse(chunks, includeDone = false) {
  return new Response(createEventStream(chunks, includeDone), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream"
    }
  });
}
describe("session.llm.stream", () => {
  test("sends temperature, tokens, and reasoning options for openai-compatible models", async () => {
    const server = state.server;
    if (!server) {
      throw new Error("Server not initialized");
    }
    const providerID = "lmstudio";
    const modelID = "openai/gpt-oss-20b";
    const fixture = await loadFixture(providerID, modelID);
    const model = fixture.model;
    const request = waitRequest("/chat/completions", new Response(createChatStream("Hello"), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream"
      }
    }));
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          enabled_providers: [providerID],
          provider: {
            [providerID]: {
              options: {
                apiKey: "test-key",
                baseURL: `${server.url.origin}/v1`
              }
            }
          }
        }));
      }
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const resolved = await getModel(ProviderID.make(providerID), ModelID.make(model.id));
        const sessionID = SessionID.make("session-test-1");
        const agent = {
          name: "test",
          mode: "primary",
          options: {},
          permission: [{
            permission: "*",
            pattern: "*",
            action: "allow"
          }],
          temperature: 0.4,
          topP: 0.8
        };
        const user = {
          id: MessageID.make("user-1"),
          sessionID,
          role: "user",
          time: {
            created: Date.now()
          },
          agent: agent.name,
          model: {
            providerID: ProviderID.make(providerID),
            modelID: resolved.id,
            variant: "high"
          }
        };
        await drain({
          user,
          sessionID,
          model: resolved,
          agent,
          system: ["You are a helpful assistant."],
          messages: [{
            role: "user",
            content: "Hello"
          }],
          tools: {}
        });
        const capture = await request;
        const body = capture.body;
        const headers = capture.headers;
        const url = capture.url;
        expect(url.pathname.startsWith("/v1/")).toBe(true);
        expect(url.pathname.endsWith("/chat/completions")).toBe(true);
        expect(headers.get("Authorization")).toBe("Bearer test-key");
        expect(body.model).toBe(resolved.api.id);
        expect(body.temperature).toBe(0.4);
        expect(body.top_p).toBe(0.8);
        expect(body.stream).toBe(true);
        const maxTokens = body.max_tokens ?? body.max_output_tokens;
        const expectedMaxTokens = ProviderTransform.maxOutputTokens(resolved);
        expect(maxTokens).toBe(expectedMaxTokens);
        const reasoning = body.reasoningEffort ?? body.reasoning_effort;
        expect(reasoning).toBe("high");
      }
    });
  });
  test("service stream cancellation cancels provider response body promptly", async () => {
    const server = state.server;
    if (!server) throw new Error("Server not initialized");
    const providerID = "lmstudio";
    const modelID = "openai/gpt-oss-20b";
    const fixture = await loadFixture(providerID, modelID);
    const model = fixture.model;
    const pending = waitStreamingRequest("/chat/completions");
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          enabled_providers: [providerID],
          provider: {
            [providerID]: {
              options: {
                apiKey: "test-key",
                baseURL: `${server.url.origin}/v1`
              }
            }
          }
        }));
      }
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const resolved = await getModel(ProviderID.make(providerID), ModelID.make(model.id));
        const sessionID = SessionID.make("session-test-service-abort");
        const agent = {
          name: "test",
          mode: "primary",
          options: {},
          permission: [{
            permission: "*",
            pattern: "*",
            action: "allow"
          }]
        };
        const user = {
          id: MessageID.make("user-service-abort"),
          sessionID,
          role: "user",
          time: {
            created: Date.now()
          },
          agent: agent.name,
          model: {
            providerID: ProviderID.make(providerID),
            modelID: resolved.id
          }
        };
        const ctrl = new AbortController();
        const run = llm.runPromiseExit(svc => svc.stream({
          user,
          sessionID,
          model: resolved,
          agent,
          system: ["You are a helpful assistant."],
          messages: [{
            role: "user",
            content: "Hello"
          }],
          tools: {}
        }).pipe(Stream.runDrain), {
          signal: ctrl.signal
        });
        await pending.request;
        ctrl.abort();
        await Promise.race([pending.responseCanceled, timeout(500)]);
        const exit = await run;
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.hasInterrupts(exit.cause)).toBe(true);
        }
        await Promise.race([pending.requestAborted, timeout(500)]).catch(() => undefined);
      }
    });
  });
  test("keeps tools enabled by prompt permissions", async () => {
    const server = state.server;
    if (!server) {
      throw new Error("Server not initialized");
    }
    const providerID = "lmstudio";
    const modelID = "openai/gpt-oss-20b";
    const fixture = await loadFixture(providerID, modelID);
    const model = fixture.model;
    const request = waitRequest("/chat/completions", new Response(createChatStream("Hello"), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream"
      }
    }));
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          enabled_providers: [providerID],
          provider: {
            [providerID]: {
              options: {
                apiKey: "test-key",
                baseURL: `${server.url.origin}/v1`
              }
            }
          }
        }));
      }
    });
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        const resolved = await getModel(ProviderID.make(providerID), ModelID.make(model.id));
        const sessionID = SessionID.make("session-test-tools");
        const agent = {
          name: "test",
          mode: "primary",
          options: {},
          permission: [{
            permission: "question",
            pattern: "*",
            action: "deny"
          }]
        };
        const user = {
          id: MessageID.make("user-tools"),
          sessionID,
          role: "user",
          time: {
            created: Date.now()
          },
          agent: agent.name,
          model: {
            providerID: ProviderID.make(providerID),
            modelID: resolved.id
          },
          tools: {
            question: true
          }
        };
        await drain({
          user,
          sessionID,
          model: resolved,
          agent,
          permission: [{
            permission: "question",
            pattern: "*",
            action: "allow"
          }],
          system: ["You are a helpful assistant."],
          messages: [{
            role: "user",
            content: "Hello"
          }],
          tools: {
            question: tool({
              description: "Ask a question",
              inputSchema: z.object({}),
              execute: async () => ({
                output: ""
              })
            })
          }
        });
        const capture = await request;
        const tools = capture.body.tools;
        expect(tools?.some(item => item.function?.name === "question")).toBe(true);
      }
    });
  });
  test("isLocalURL accepts localhost / private addrs and rejects public hosts", () => {
    expect(Provider.isLocalURL("http://127.0.0.1:1234")).toBe(true);
    expect(Provider.isLocalURL("http://localhost:11434")).toBe(true);
    expect(Provider.isLocalURL("http://192.168.1.50:8000")).toBe(true);
    expect(Provider.isLocalURL("http://10.0.0.5/v1")).toBe(true);
    expect(Provider.isLocalURL("http://my-rig.local/v1")).toBe(true);
    expect(Provider.isLocalURL("https://api.openai.com/v1")).toBe(false);
    expect(Provider.isLocalURL("https://api.anthropic.com")).toBe(false);
    expect(Provider.isLocalURL("https://generativelanguage.googleapis.com")).toBe(false);
  });
  test("isLocalProvider hides providers whose only baseURL is external", () => {
    expect(Provider.isLocalProvider({
      options: { baseURL: "http://127.0.0.1:11434" },
      models: {}
    })).toBe(true);
    expect(Provider.isLocalProvider({
      options: { baseURL: "https://api.openai.com" },
      models: { foo: { api: { url: "http://127.0.0.1:1234" } } }
    })).toBe(true);
    expect(Provider.isLocalProvider({
      options: { baseURL: "https://api.openai.com" },
      models: { foo: { api: { url: "https://api.openai.com" } } }
    })).toBe(false);
    expect(Provider.isLocalProvider({
      options: {},
      models: {}
    })).toBe(false);
  });
});
