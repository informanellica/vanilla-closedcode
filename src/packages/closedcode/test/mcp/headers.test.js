import {  Effect  } from "effect"
import {  test, expect, jest, beforeEach, beforeAll  } from "@jest/globals"
import { writeFile } from "../lib/io.js";

// Track what options were passed to each transport constructor
const transportCalls = [];

// Mock the transport constructors to capture their arguments
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    constructor(url, options) {
      transportCalls.push({
        type: "streamable",
        url: url.toString(),
        options: options ?? {}
      });
    }
    async start() {
      throw new Error("Mock transport cannot connect");
    }
  }
}));
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(url, options) {
      transportCalls.push({
        type: "sse",
        url: url.toString(),
        options: options ?? {}
      });
    }
    async start() {
      throw new Error("Mock transport cannot connect");
    }
  }
}));
beforeEach(() => {
  transportCalls.length = 0;
});

// Import MCP after mocking
const {
  MCP
} = await import("../../src/mcp/index.js");
const {
  AppRuntime
} = await import("../../src/effect/app-runtime.js");
const {
  Instance
} = await import("../../src/project/instance.js");
const {
  WithInstance
} = await import("../../src/project/with-instance.js");
const {
  tmpdir
} = await import("../fixture/fixture.js");
const service = MCP.Service;
test("headers are passed to transports when oauth is enabled (default)", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(`${dir}/closedcode.json`, JSON.stringify({
        mcp: {
          "test-server": {
            type: "remote",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer test-token",
              "X-Custom-Header": "custom-value"
            }
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      // Trigger MCP initialization - it will fail to connect but we can check the transport options
      await AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        yield* mcp.add("test-server", {
          type: "remote",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer test-token",
            "X-Custom-Header": "custom-value"
          }
        }).pipe(Effect.catch(() => Effect.void));
      }));

      // Both transports should have been created with headers
      expect(transportCalls.length).toBeGreaterThanOrEqual(1);
      for (const call of transportCalls) {
        expect(call.options.requestInit).toBeDefined();
        expect(call.options.requestInit?.headers).toEqual({
          Authorization: "Bearer test-token",
          "X-Custom-Header": "custom-value"
        });
        // OAuth should be enabled by default, so authProvider should exist
        expect(call.options.authProvider).toBeDefined();
      }
    }
  });
});
test("headers are passed to transports when oauth is explicitly disabled", async () => {
  await using tmp = await tmpdir();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      transportCalls.length = 0;
      await AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        yield* mcp.add("test-server-no-oauth", {
          type: "remote",
          url: "https://example.com/mcp",
          oauth: false,
          headers: {
            Authorization: "Bearer test-token"
          }
        }).pipe(Effect.catch(() => Effect.void));
      }));
      expect(transportCalls.length).toBeGreaterThanOrEqual(1);
      for (const call of transportCalls) {
        expect(call.options.requestInit).toBeDefined();
        expect(call.options.requestInit?.headers).toEqual({
          Authorization: "Bearer test-token"
        });
        // OAuth is disabled, so no authProvider
        expect(call.options.authProvider).toBeUndefined();
      }
    }
  });
});
test("no requestInit when headers are not provided", async () => {
  await using tmp = await tmpdir();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      transportCalls.length = 0;
      await AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        yield* mcp.add("test-server-no-headers", {
          type: "remote",
          url: "https://example.com/mcp"
        }).pipe(Effect.catch(() => Effect.void));
      }));
      expect(transportCalls.length).toBeGreaterThanOrEqual(1);
      for (const call of transportCalls) {
        // No headers means requestInit should be undefined
        expect(call.options.requestInit).toBeUndefined();
      }
    }
  });
});