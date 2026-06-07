import { dynamicTool, jsonSchema } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { CallToolResultSchema, ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { Config } from "@/config/config.js";
import * as Log from "core/util/log";
import { NamedError } from "core/util/error";
import z from "zod/v4";
import { InstallationVersion } from "core/installation/version";
import { withTimeout } from "@/util/timeout.js";
import { AppFileSystem } from "core/filesystem";
import { McpOAuthProvider } from "./oauth-provider.js";
import { McpOAuthCallback } from "./oauth-callback.js";
import { McpAuth } from "./auth.js";
import { BusEvent } from "../bus/bus-event.js";
import { Bus } from "@/bus/index.js";
import { TuiEvent } from "@/cli/cmd/tui/event.js";
import open from "open";
import { Effect, Exit, Layer, Option, Context, Schema, Stream } from "effect";
import { EffectBridge } from "@/effect/bridge.js";
import { InstanceState } from "@/effect/instance-state.js";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { zod as effectZod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const log = Log.create({
  service: "mcp"
});
const DEFAULT_TIMEOUT = 30_000;
export const Resource = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optional(Schema.String),
  client: Schema.String
}).annotate({
  identifier: "McpResource"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));
export const ToolsChanged = BusEvent.define("mcp.tools.changed", Schema.Struct({
  server: Schema.String
}));
export const BrowserOpenFailed = BusEvent.define("mcp.browser.open.failed", Schema.Struct({
  mcpName: Schema.String,
  url: Schema.String
}));
export const Failed = NamedError.create("MCPFailed", z.object({
  name: z.string()
}));
const StatusConnected = Schema.Struct({
  status: Schema.Literal("connected")
}).annotate({
  identifier: "MCPStatusConnected"
});
const StatusDisabled = Schema.Struct({
  status: Schema.Literal("disabled")
}).annotate({
  identifier: "MCPStatusDisabled"
});
const StatusFailed = Schema.Struct({
  status: Schema.Literal("failed"),
  error: Schema.String
}).annotate({
  identifier: "MCPStatusFailed"
});
const StatusNeedsAuth = Schema.Struct({
  status: Schema.Literal("needs_auth")
}).annotate({
  identifier: "MCPStatusNeedsAuth"
});
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String
}).annotate({
  identifier: "MCPStatusNeedsClientRegistration"
});
export const Status = Schema.Union([StatusConnected, StatusDisabled, StatusFailed, StatusNeedsAuth, StatusNeedsClientRegistration]).annotate({
  identifier: "MCPStatus",
  discriminator: "status"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));

// Store transports for OAuth servers to allow finishing auth

const pendingOAuthTransports = new Map();

// Prompt cache types

function isMcpConfigured(entry) {
  return typeof entry === "object" && entry !== null && "type" in entry;
}
const sanitize = s => s.replace(/[^a-zA-Z0-9_-]/g, "_");
function remoteURL(key, value) {
  if (URL.canParse(value)) return new URL(value);
  log.warn("invalid remote mcp url", {
    key
  });
}

// Convert MCP tool definition to AI SDK Tool type
function convertMcpTool(mcpTool, client, timeout) {
  const inputSchema = mcpTool.inputSchema;

  // Spread first, then override type to ensure it's always "object"
  const schema = {
    ...inputSchema,
    type: "object",
    properties: inputSchema.properties ?? {},
    additionalProperties: false
  };
  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),
    execute: async args => {
      return client.callTool({
        name: mcpTool.name,
        arguments: args || {}
      }, CallToolResultSchema, {
        resetTimeoutOnProgress: true,
        timeout
      });
    }
  });
}
function defs(key, client, timeout) {
  return Effect.tryPromise({
    try: () => withTimeout(client.listTools(), timeout ?? DEFAULT_TIMEOUT),
    catch: err => err instanceof Error ? err : new Error(String(err))
  }).pipe(Effect.map(result => result.tools), Effect.catch(err => {
    log.error("failed to get tools from client", {
      key,
      error: err
    });
    return Effect.succeed(undefined);
  }));
}
function fetchFromClient(clientName, client, listFn, label) {
  return Effect.tryPromise({
    try: () => listFn(client),
    catch: e => {
      log.error(`failed to get ${label}`, {
        clientName,
        error: e.message
      });
      return e;
    }
  }).pipe(Effect.map(items => {
    const out = {};
    const sanitizedClient = sanitize(clientName);
    for (const item of items) {
      out[sanitizedClient + ":" + sanitize(item.name)] = {
        ...item,
        client: clientName
      };
    }
    return out;
  }), Effect.orElseSucceed(() => undefined));
}

// --- Effect Service ---

export class Service extends Context.Service()("@closedcode/MCP") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const auth = yield* McpAuth.Service;
  const bus = yield* Bus.Service;
  /**
   * Connect a client via the given transport with resource safety:
   * on failure the transport is closed; on success the caller owns it.
   */
  const connectTransport = (transport, timeout) => Effect.acquireUseRelease(Effect.succeed(transport), t => Effect.tryPromise({
    try: () => {
      const client = new Client({
        name: "closedcode",
        version: InstallationVersion
      });
      return withTimeout(client.connect(t), timeout).then(() => client);
    },
    catch: e => e instanceof Error ? e : new Error(String(e))
  }), (t, exit) => Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()).pipe(Effect.ignore) : Effect.void);
  const DISABLED_RESULT = {
    status: {
      status: "disabled"
    }
  };
  const connectRemote = Effect.fn("MCP.connectRemote")(function* (key, mcp) {
    const oauthDisabled = mcp.oauth === false;
    const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined;
    const url = remoteURL(key, mcp.url);
    if (!url) {
      return {
        client: undefined,
        status: {
          status: "failed",
          error: `Invalid MCP URL for "${key}"`
        }
      };
    }
    let authProvider;
    if (!oauthDisabled) {
      authProvider = new McpOAuthProvider(key, mcp.url, {
        clientId: oauthConfig?.clientId,
        clientSecret: oauthConfig?.clientSecret,
        scope: oauthConfig?.scope,
        redirectUri: oauthConfig?.redirectUri
      }, {
        onRedirect: async url => {
          log.info("oauth redirect requested", {
            key,
            url: url.toString()
          });
        }
      }, auth);
    }
    const transports = [{
      name: "StreamableHTTP",
      transport: new StreamableHTTPClientTransport(url, {
        authProvider,
        requestInit: mcp.headers ? {
          headers: mcp.headers
        } : undefined
      })
    }, {
      name: "SSE",
      transport: new SSEClientTransport(url, {
        authProvider,
        requestInit: mcp.headers ? {
          headers: mcp.headers
        } : undefined
      })
    }];
    const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT;
    let lastStatus;
    for (const {
      name,
      transport
    } of transports) {
      const result = yield* connectTransport(transport, connectTimeout).pipe(Effect.map(client => ({
        client,
        transportName: name
      })), Effect.catch(error => {
        const lastError = error instanceof Error ? error : new Error(String(error));
        const isAuthError = error instanceof UnauthorizedError || authProvider && lastError.message.includes("OAuth");
        if (isAuthError) {
          log.info("mcp server requires authentication", {
            key,
            transport: name
          });
          if (lastError.message.includes("registration") || lastError.message.includes("client_id")) {
            lastStatus = {
              status: "needs_client_registration",
              error: "Server does not support dynamic client registration. Please provide clientId in config."
            };
            return bus.publish(TuiEvent.ToastShow, {
              title: "MCP Authentication Required",
              message: `Server "${key}" requires a pre-registered client ID. Add clientId to your config.`,
              variant: "warning",
              duration: 8000
            }).pipe(Effect.ignore, Effect.as(undefined));
          } else {
            pendingOAuthTransports.set(key, transport);
            lastStatus = {
              status: "needs_auth"
            };
            return bus.publish(TuiEvent.ToastShow, {
              title: "MCP Authentication Required",
              message: `Server "${key}" requires authentication. Run: closedcode mcp auth ${key}`,
              variant: "warning",
              duration: 8000
            }).pipe(Effect.ignore, Effect.as(undefined));
          }
        }
        log.debug("transport connection failed", {
          key,
          transport: name,
          url: mcp.url,
          error: lastError.message
        });
        lastStatus = {
          status: "failed",
          error: lastError.message
        };
        return Effect.succeed(undefined);
      }));
      if (result) {
        log.info("connected", {
          key,
          transport: result.transportName
        });
        return {
          client: result.client,
          status: {
            status: "connected"
          }
        };
      }
      // If this was an auth error, stop trying other transports
      if (lastStatus?.status === "needs_auth" || lastStatus?.status === "needs_client_registration") break;
    }
    return {
      client: undefined,
      status: lastStatus ?? {
        status: "failed",
        error: "Unknown error"
      }
    };
  });
  const connectLocal = Effect.fn("MCP.connectLocal")(function* (key, mcp) {
    const [cmd, ...args] = mcp.command;
    const cwd = yield* InstanceState.directory;
    const transport = new StdioClientTransport({
      stderr: "pipe",
      command: cmd,
      args,
      cwd,
      env: {
        ...process.env,
        ...mcp.environment
      }
    });
    transport.stderr?.on("data", chunk => {
      log.info(`mcp stderr: ${chunk.toString()}`, {
        key
      });
    });
    const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT;
    return yield* connectTransport(transport, connectTimeout).pipe(Effect.map(client => ({
      client,
      status: {
        status: "connected"
      }
    })), Effect.catch(error => {
      const msg = error instanceof Error ? error.message : String(error);
      log.error("local mcp startup failed", {
        key,
        command: mcp.command,
        cwd,
        error: msg
      });
      return Effect.succeed({
        client: undefined,
        status: {
          status: "failed",
          error: msg
        }
      });
    }));
  });
  const create = Effect.fn("MCP.create")(function* (key, mcp) {
    if (mcp.enabled === false) {
      log.info("mcp server disabled", {
        key
      });
      return DISABLED_RESULT;
    }
    log.info("found", {
      key,
      type: mcp.type
    });
    const {
      client: mcpClient,
      status
    } = mcp.type === "remote" ? yield* connectRemote(key, mcp) : yield* connectLocal(key, mcp);
    if (!mcpClient) {
      return {
        status
      };
    }
    const listed = yield* defs(key, mcpClient, mcp.timeout);
    if (!listed) {
      yield* Effect.tryPromise(() => mcpClient.close()).pipe(Effect.ignore);
      return {
        status: {
          status: "failed",
          error: "Failed to get tools"
        }
      };
    }
    log.info("create() successfully created client", {
      key,
      toolCount: listed.length
    });
    return {
      mcpClient,
      status,
      defs: listed
    };
  });
  const cfgSvc = yield* Config.Service;
  const descendants = Effect.fnUntraced(function* (pid) {
    if (process.platform === "win32") return [];
    const pids = [];
    const queue = [pid];
    while (queue.length > 0) {
      const current = queue.shift();
      const handle = yield* spawner.spawn(ChildProcess.make("pgrep", ["-P", String(current)], {
        stdin: "ignore"
      }));
      const text = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      yield* handle.exitCode;
      for (const tok of text.split("\n")) {
        const cpid = parseInt(tok, 10);
        if (!isNaN(cpid) && !pids.includes(cpid)) {
          pids.push(cpid);
          queue.push(cpid);
        }
      }
    }
    return pids;
  }, Effect.scoped, Effect.catch(() => Effect.succeed([])));
  function watch(s, name, client, bridge, timeout) {
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      log.info("tools list changed notification received", {
        server: name
      });
      if (s.clients[name] !== client || s.status[name]?.status !== "connected") return;
      const listed = await bridge.promise(defs(name, client, timeout));
      if (!listed) return;
      if (s.clients[name] !== client || s.status[name]?.status !== "connected") return;
      s.defs[name] = listed;
      await bridge.promise(bus.publish(ToolsChanged, {
        server: name
      }).pipe(Effect.ignore));
    });
  }
  const state = yield* InstanceState.make(Effect.fn("MCP.state")(function* () {
    const cfg = yield* cfgSvc.get();
    const bridge = yield* EffectBridge.make();
    const config = cfg.mcp ?? {};
    const s = {
      status: {},
      clients: {},
      defs: {}
    };
    yield* Effect.forEach(Object.entries(config), ([key, mcp]) => Effect.gen(function* () {
      if (!isMcpConfigured(mcp)) {
        log.error("Ignoring MCP config entry without type", {
          key
        });
        return;
      }
      if (mcp.enabled === false) {
        s.status[key] = {
          status: "disabled"
        };
        return;
      }
      const result = yield* create(key, mcp).pipe(Effect.catch(() => Effect.void));
      if (!result) return;
      s.status[key] = result.status;
      if (result.mcpClient) {
        s.clients[key] = result.mcpClient;
        s.defs[key] = result.defs;
        watch(s, key, result.mcpClient, bridge, mcp.timeout);
      }
    }), {
      concurrency: "unbounded"
    });
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Effect.forEach(Object.values(s.clients), client => Effect.gen(function* () {
        const pid = client.transport instanceof StdioClientTransport ? client.transport.pid : null;
        if (typeof pid === "number") {
          const pids = yield* descendants(pid);
          for (const dpid of pids) {
            try {
              process.kill(dpid, "SIGTERM");
            } catch {}
          }
        }
        yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore);
      }), {
        concurrency: "unbounded"
      });
      pendingOAuthTransports.clear();
    }));
    return s;
  }));
  function closeClient(s, name) {
    const client = s.clients[name];
    delete s.defs[name];
    if (!client) return Effect.void;
    return Effect.tryPromise(() => client.close()).pipe(Effect.ignore);
  }
  const storeClient = Effect.fnUntraced(function* (s, name, client, listed, timeout) {
    const bridge = yield* EffectBridge.make();
    yield* closeClient(s, name);
    s.status[name] = {
      status: "connected"
    };
    s.clients[name] = client;
    s.defs[name] = listed;
    watch(s, name, client, bridge, timeout);
    return s.status[name];
  });
  const status = Effect.fn("MCP.status")(function* () {
    const s = yield* InstanceState.get(state);
    const cfg = yield* cfgSvc.get();
    const config = cfg.mcp ?? {};
    const result = {};
    for (const [key, mcp] of Object.entries(config)) {
      if (!isMcpConfigured(mcp)) continue;
      result[key] = s.status[key] ?? {
        status: "disabled"
      };
    }
    return result;
  });
  const clients = Effect.fn("MCP.clients")(function* () {
    const s = yield* InstanceState.get(state);
    return s.clients;
  });
  const createAndStore = Effect.fn("MCP.createAndStore")(function* (name, mcp) {
    const s = yield* InstanceState.get(state);
    const result = yield* create(name, mcp);
    s.status[name] = result.status;
    if (!result.mcpClient) {
      yield* closeClient(s, name);
      delete s.clients[name];
      return result.status;
    }
    return yield* storeClient(s, name, result.mcpClient, result.defs, mcp.timeout);
  });
  const add = Effect.fn("MCP.add")(function* (name, mcp) {
    yield* createAndStore(name, mcp);
    const s = yield* InstanceState.get(state);
    return {
      status: s.status
    };
  });
  const connect = Effect.fn("MCP.connect")(function* (name) {
    const mcp = yield* getMcpConfig(name);
    if (!mcp) {
      log.error("MCP config not found or invalid", {
        name
      });
      return;
    }
    yield* createAndStore(name, {
      ...mcp,
      enabled: true
    });
  });
  const disconnect = Effect.fn("MCP.disconnect")(function* (name) {
    const s = yield* InstanceState.get(state);
    yield* closeClient(s, name);
    delete s.clients[name];
    s.status[name] = {
      status: "disabled"
    };
  });
  const tools = Effect.fn("MCP.tools")(function* () {
    const result = {};
    const s = yield* InstanceState.get(state);
    const cfg = yield* cfgSvc.get();
    const config = cfg.mcp ?? {};
    const defaultTimeout = cfg.experimental?.mcp_timeout;
    const connectedClients = Object.entries(s.clients).filter(([clientName]) => s.status[clientName]?.status === "connected");
    yield* Effect.forEach(connectedClients, ([clientName, client]) => Effect.gen(function* () {
      const mcpConfig = config[clientName];
      const entry = mcpConfig && isMcpConfigured(mcpConfig) ? mcpConfig : undefined;
      const listed = s.defs[clientName];
      if (!listed) {
        log.warn("missing cached tools for connected server", {
          clientName
        });
        return;
      }
      const timeout = entry?.timeout ?? defaultTimeout;
      for (const mcpTool of listed) {
        result[sanitize(clientName) + "_" + sanitize(mcpTool.name)] = convertMcpTool(mcpTool, client, timeout);
      }
    }), {
      concurrency: "unbounded"
    });
    return result;
  });
  function collectFromConnected(s, listFn, label) {
    return Effect.forEach(Object.entries(s.clients).filter(([name]) => s.status[name]?.status === "connected"), ([clientName, client]) => fetchFromClient(clientName, client, listFn, label).pipe(Effect.map(items => Object.entries(items ?? {}))), {
      concurrency: "unbounded"
    }).pipe(Effect.map(results => Object.fromEntries(results.flat())));
  }
  const prompts = Effect.fn("MCP.prompts")(function* () {
    const s = yield* InstanceState.get(state);
    return yield* collectFromConnected(s, c => c.listPrompts().then(r => r.prompts), "prompts");
  });
  const resources = Effect.fn("MCP.resources")(function* () {
    const s = yield* InstanceState.get(state);
    return yield* collectFromConnected(s, c => c.listResources().then(r => r.resources), "resources");
  });
  const withClient = Effect.fnUntraced(function* (clientName, fn, label, meta) {
    const s = yield* InstanceState.get(state);
    const client = s.clients[clientName];
    if (!client) {
      log.warn(`client not found for ${label}`, {
        clientName
      });
      return undefined;
    }
    return yield* Effect.tryPromise({
      try: () => fn(client),
      catch: e => {
        log.error(`failed to ${label}`, {
          clientName,
          ...meta,
          error: e?.message
        });
        return e;
      }
    }).pipe(Effect.orElseSucceed(() => undefined));
  });
  const getPrompt = Effect.fn("MCP.getPrompt")(function* (clientName, name, args) {
    return yield* withClient(clientName, client => client.getPrompt({
      name,
      arguments: args
    }), "getPrompt", {
      promptName: name
    });
  });
  const readResource = Effect.fn("MCP.readResource")(function* (clientName, resourceUri) {
    return yield* withClient(clientName, client => client.readResource({
      uri: resourceUri
    }), "readResource", {
      resourceUri
    });
  });
  const getMcpConfig = Effect.fnUntraced(function* (mcpName) {
    const cfg = yield* cfgSvc.get();
    const mcpConfig = cfg.mcp?.[mcpName];
    if (!mcpConfig || !isMcpConfigured(mcpConfig)) return undefined;
    return mcpConfig;
  });
  const startAuth = Effect.fn("MCP.startAuth")(function* (mcpName) {
    const mcpConfig = yield* getMcpConfig(mcpName);
    if (!mcpConfig) throw new Error(`MCP server ${mcpName} not found or disabled`);
    if (mcpConfig.type !== "remote") throw new Error(`MCP server ${mcpName} is not a remote server`);
    if (mcpConfig.oauth === false) throw new Error(`MCP server ${mcpName} has OAuth explicitly disabled`);
    const url = remoteURL(mcpName, mcpConfig.url);
    if (!url) throw new Error(`Invalid MCP URL for "${mcpName}"`);

    // OAuth config is optional - if not provided, we'll use auto-discovery
    const oauthConfig = typeof mcpConfig.oauth === "object" ? mcpConfig.oauth : undefined;

    // Start the callback server with custom redirectUri if configured
    yield* Effect.promise(() => McpOAuthCallback.ensureRunning(oauthConfig?.redirectUri));
    const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");
    yield* auth.updateOAuthState(mcpName, oauthState);
    let capturedUrl;
    const authProvider = new McpOAuthProvider(mcpName, mcpConfig.url, {
      clientId: oauthConfig?.clientId,
      clientSecret: oauthConfig?.clientSecret,
      scope: oauthConfig?.scope,
      redirectUri: oauthConfig?.redirectUri
    }, {
      onRedirect: async url => {
        capturedUrl = url;
      }
    }, auth);
    const transport = new StreamableHTTPClientTransport(url, {
      authProvider
    });
    return yield* Effect.tryPromise({
      try: () => {
        const client = new Client({
          name: "closedcode",
          version: InstallationVersion
        });
        return client.connect(transport).then(() => ({
          authorizationUrl: "",
          oauthState,
          client
        }));
      },
      catch: error => error
    }).pipe(Effect.catch(error => {
      if (error instanceof UnauthorizedError && capturedUrl) {
        pendingOAuthTransports.set(mcpName, transport);
        return Effect.succeed({
          authorizationUrl: capturedUrl.toString(),
          oauthState
        });
      }
      return Effect.die(error);
    }));
  });
  const authenticate = Effect.fn("MCP.authenticate")(function* (mcpName) {
    const result = yield* startAuth(mcpName);
    if (!result.authorizationUrl) {
      const client = "client" in result ? result.client : undefined;
      const mcpConfig = yield* getMcpConfig(mcpName);
      if (!mcpConfig) {
        yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore);
        return {
          status: "failed",
          error: "MCP config not found after auth"
        };
      }
      const listed = client ? yield* defs(mcpName, client, mcpConfig.timeout) : undefined;
      if (!client || !listed) {
        yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore);
        return {
          status: "failed",
          error: "Failed to get tools"
        };
      }
      const s = yield* InstanceState.get(state);
      yield* auth.clearOAuthState(mcpName);
      return yield* storeClient(s, mcpName, client, listed, mcpConfig.timeout);
    }
    log.info("opening browser for oauth", {
      mcpName,
      url: result.authorizationUrl,
      state: result.oauthState
    });
    const callbackPromise = McpOAuthCallback.waitForCallback(result.oauthState, mcpName);
    yield* Effect.tryPromise(() => open(result.authorizationUrl)).pipe(Effect.flatMap(subprocess => Effect.callback(resume => {
      const timer = setTimeout(() => resume(Effect.void), 500);
      subprocess.on("error", err => {
        clearTimeout(timer);
        resume(Effect.fail(err));
      });
      subprocess.on("exit", code => {
        if (code !== null && code !== 0) {
          clearTimeout(timer);
          resume(Effect.fail(new Error(`Browser open failed with exit code ${code}`)));
        }
      });
    })), Effect.catch(() => {
      log.warn("failed to open browser, user must open URL manually", {
        mcpName
      });
      return bus.publish(BrowserOpenFailed, {
        mcpName,
        url: result.authorizationUrl
      }).pipe(Effect.ignore);
    }));
    const code = yield* Effect.promise(() => callbackPromise);
    const storedState = yield* auth.getOAuthState(mcpName);
    if (storedState !== result.oauthState) {
      yield* auth.clearOAuthState(mcpName);
      throw new Error("OAuth state mismatch - potential CSRF attack");
    }
    yield* auth.clearOAuthState(mcpName);
    return yield* finishAuth(mcpName, code);
  });
  const finishAuth = Effect.fn("MCP.finishAuth")(function* (mcpName, authorizationCode) {
    const transport = pendingOAuthTransports.get(mcpName);
    if (!transport) throw new Error(`No pending OAuth flow for MCP server: ${mcpName}`);
    const result = yield* Effect.tryPromise({
      try: () => transport.finishAuth(authorizationCode).then(() => true),
      catch: error => {
        log.error("failed to finish oauth", {
          mcpName,
          error
        });
        return error;
      }
    }).pipe(Effect.option);
    if (Option.isNone(result)) {
      return {
        status: "failed",
        error: "OAuth completion failed"
      };
    }
    yield* auth.clearCodeVerifier(mcpName);
    pendingOAuthTransports.delete(mcpName);
    const mcpConfig = yield* getMcpConfig(mcpName);
    if (!mcpConfig) return {
      status: "failed",
      error: "MCP config not found after auth"
    };
    return yield* createAndStore(mcpName, mcpConfig);
  });
  const removeAuth = Effect.fn("MCP.removeAuth")(function* (mcpName) {
    yield* auth.remove(mcpName);
    McpOAuthCallback.cancelPending(mcpName);
    pendingOAuthTransports.delete(mcpName);
    log.info("removed oauth credentials", {
      mcpName
    });
  });
  const supportsOAuth = Effect.fn("MCP.supportsOAuth")(function* (mcpName) {
    const mcpConfig = yield* getMcpConfig(mcpName);
    if (!mcpConfig) return false;
    return mcpConfig.type === "remote" && mcpConfig.oauth !== false;
  });
  const hasStoredTokens = Effect.fn("MCP.hasStoredTokens")(function* (mcpName) {
    const entry = yield* auth.get(mcpName);
    return !!entry?.tokens;
  });
  const getAuthStatus = Effect.fn("MCP.getAuthStatus")(function* (mcpName) {
    const entry = yield* auth.get(mcpName);
    if (!entry?.tokens) return "not_authenticated";
    const expired = yield* auth.isTokenExpired(mcpName);
    return expired ? "expired" : "authenticated";
  });
  return Service.of({
    status,
    clients,
    tools,
    prompts,
    resources,
    add,
    connect,
    disconnect,
    getPrompt,
    readResource,
    startAuth,
    authenticate,
    finishAuth,
    removeAuth,
    supportsOAuth,
    hasStoredTokens,
    getAuthStatus
  });
}));
// --- Per-service runtime ---

export const defaultLayer = layer.pipe(Layer.provide(McpAuth.layer), Layer.provide(Bus.layer), Layer.provide(Config.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(AppFileSystem.defaultLayer));
export * as MCP from "./index.js";