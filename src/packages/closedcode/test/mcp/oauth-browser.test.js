import {  Effect  } from "effect"
import {  test, expect, jest, beforeEach, beforeAll  } from "@jest/globals"
import {  EventEmitter  } from "events"
import { writeFile } from "../lib/io.js";

// Track open() calls and control failure behavior
let openShouldFail = false;
let openCalledWith;
jest.unstable_mockModule("open", () => ({
  default: async url => {
    openCalledWith = url;

    // Return a mock subprocess that emits an error if openShouldFail is true
    const subprocess = new EventEmitter();
    if (openShouldFail) {
      // Emit error asynchronously like a real subprocess would
      setTimeout(() => {
        subprocess.emit("error", new Error("spawn xdg-open ENOENT"));
      }, 10);
    }
    return subprocess;
  }
}));

// Mock UnauthorizedError
class MockUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

// Track what options were passed to each transport constructor
const transportCalls = [];

// Mock the transport constructors
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    constructor(url, options) {
      this.url = url.toString();
      this.authProvider = options?.authProvider;
      transportCalls.push({
        type: "streamable",
        url: url.toString(),
        options: options ?? {}
      });
    }
    async start() {
      // Simulate OAuth redirect by calling the authProvider's redirectToAuthorization
      if (this.authProvider?.redirectToAuthorization) {
        await this.authProvider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=test"));
      }
      throw new MockUnauthorizedError();
    }
    async finishAuth(_code) {
      // Mock successful auth completion
    }
  }
}));
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(url) {
      transportCalls.push({
        type: "sse",
        url: url.toString(),
        options: {}
      });
    }
    async start() {
      throw new Error("Mock SSE transport cannot connect");
    }
  }
}));

// Mock the MCP SDK Client to trigger OAuth flow
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    async connect(transport) {
      await transport.start();
    }
  }
}));

// Mock UnauthorizedError in the auth module
jest.unstable_mockModule("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: MockUnauthorizedError
}));
beforeEach(() => {
  openShouldFail = false;
  openCalledWith = undefined;
  transportCalls.length = 0;
});

// Import modules after mocking
const {
  MCP
} = await import("../../src/mcp/index.js");
const {
  AppRuntime
} = await import("../../src/effect/app-runtime.js");
const {
  Bus
} = await import("../../src/bus/index.js");
const {
  McpOAuthCallback
} = await import("../../src/mcp/oauth-callback.js");
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
test("BrowserOpenFailed event is published when open() throws", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(`${dir}/closedcode.json`, JSON.stringify({
        mcp: {
          "test-oauth-server": {
            type: "remote",
            url: "https://example.com/mcp"
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = true;
      const events = [];
      const unsubscribe = Bus.subscribe(MCP.BrowserOpenFailed, evt => {
        events.push(evt.properties);
      });

      // Run authenticate with a timeout to avoid waiting forever for the callback
      // Attach a handler immediately so callback shutdown rejections
      // don't show up as unhandled between tests.
      const authPromise = AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        return yield* mcp.authenticate("test-oauth-server");
      })).catch(() => undefined);

      // Config.get() can be slow in tests, so give it plenty of time.
      await new Promise(resolve => setTimeout(resolve, 2_000));

      // Stop the callback server and cancel any pending auth
      await McpOAuthCallback.stop();
      await authPromise;
      unsubscribe();

      // Verify the BrowserOpenFailed event was published
      expect(events.length).toBe(1);
      expect(events[0].mcpName).toBe("test-oauth-server");
      expect(events[0].url).toContain("https://");
    }
  });
});
test("BrowserOpenFailed event is NOT published when open() succeeds", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(`${dir}/closedcode.json`, JSON.stringify({
        mcp: {
          "test-oauth-server-2": {
            type: "remote",
            url: "https://example.com/mcp"
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = false;
      const events = [];
      const unsubscribe = Bus.subscribe(MCP.BrowserOpenFailed, evt => {
        events.push(evt.properties);
      });

      // Run authenticate with a timeout to avoid waiting forever for the callback
      const authPromise = AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        return yield* mcp.authenticate("test-oauth-server-2");
      })).catch(() => undefined);

      // Config.get() can be slow in tests; also covers the ~500ms open() error-detection window.
      await new Promise(resolve => setTimeout(resolve, 2_000));

      // Stop the callback server and cancel any pending auth
      await McpOAuthCallback.stop();
      await authPromise;
      unsubscribe();

      // Verify NO BrowserOpenFailed event was published
      expect(events.length).toBe(0);
      // Verify open() was still called
      expect(openCalledWith).toBeDefined();
    }
  });
});
test("open() is called with the authorization URL", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(`${dir}/closedcode.json`, JSON.stringify({
        mcp: {
          "test-oauth-server-3": {
            type: "remote",
            url: "https://example.com/mcp"
          }
        }
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = false;
      openCalledWith = undefined;

      // Run authenticate with a timeout to avoid waiting forever for the callback
      const authPromise = AppRuntime.runPromise(Effect.gen(function* () {
        const mcp = yield* service;
        return yield* mcp.authenticate("test-oauth-server-3");
      })).catch(() => undefined);

      // Config.get() can be slow in tests; also covers the ~500ms open() error-detection window.
      await new Promise(resolve => setTimeout(resolve, 2_000));

      // Stop the callback server and cancel any pending auth
      await McpOAuthCallback.stop();
      await authPromise;

      // Verify open was called with a URL
      expect(openCalledWith).toBeDefined();
      expect(typeof openCalledWith).toBe("string");
      expect(openCalledWith).toContain("https://");
    }
  });
});