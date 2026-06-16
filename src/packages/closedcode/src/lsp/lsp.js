/**
 * @file LSP service: manages language-server client connections per file/root,
 * routes textDocument requests (hover, definition, references, symbols, call
 * hierarchy) to the matching clients, and exposes their diagnostics/status.
 */
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import * as Log from "core/util/log";
import * as LSPClient from "./client.js";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as LSPServer from "./server.js";
import z from "zod";
import { Config } from "#config/config.js";
import { Flag } from "core/flag/flag";
import { Process } from "#util/process.js";
import { spawn as lspspawn } from "./launch.js";
import { Effect, Layer, Context, Schema } from "effect";
import { InstanceState } from "#effect/instance-state.js";
import { containsPath } from "#project/instance-context.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
const log = Log.create({
  service: "lsp"
});
/** Bus events published by the LSP service. */
export const Event = {
  Updated: BusEvent.define("lsp.updated", Schema.Struct({}))
};
/** Schema for an LSP zero-based source position (line/character). */
const Position = Schema.Struct({
  line: NonNegativeInt,
  character: NonNegativeInt
});
/** Schema for an LSP source range (start/end positions). */
export const Range = Schema.Struct({
  start: Position,
  end: Position
}).annotate({
  identifier: "Range"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema for a workspace symbol (name, kind, and its location). */
export const Symbol = Schema.Struct({
  name: Schema.String,
  kind: NonNegativeInt,
  location: Schema.Struct({
    uri: Schema.String,
    range: Range
  })
}).annotate({
  identifier: "Symbol"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema for a document symbol (hierarchical symbol within a single file). */
export const DocumentSymbol = Schema.Struct({
  name: Schema.String,
  detail: Schema.optional(Schema.String),
  kind: NonNegativeInt,
  range: Range,
  selectionRange: Range
}).annotate({
  identifier: "DocumentSymbol"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema describing the connection status of a single LSP client. */
export const Status = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  root: Schema.String,
  status: Schema.Literals(["connected", "error"]).annotate({
    [ZodOverride]: z.union([z.literal("connected"), z.literal("error")])
  })
}).annotate({
  identifier: "LSPStatus"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** LSP SymbolKind enum: maps symbol category names to their LSP numeric codes. */
var SymbolKind = /*#__PURE__*/function (SymbolKind) {
  SymbolKind[SymbolKind["File"] = 1] = "File";
  SymbolKind[SymbolKind["Module"] = 2] = "Module";
  SymbolKind[SymbolKind["Namespace"] = 3] = "Namespace";
  SymbolKind[SymbolKind["Package"] = 4] = "Package";
  SymbolKind[SymbolKind["Class"] = 5] = "Class";
  SymbolKind[SymbolKind["Method"] = 6] = "Method";
  SymbolKind[SymbolKind["Property"] = 7] = "Property";
  SymbolKind[SymbolKind["Field"] = 8] = "Field";
  SymbolKind[SymbolKind["Constructor"] = 9] = "Constructor";
  SymbolKind[SymbolKind["Enum"] = 10] = "Enum";
  SymbolKind[SymbolKind["Interface"] = 11] = "Interface";
  SymbolKind[SymbolKind["Function"] = 12] = "Function";
  SymbolKind[SymbolKind["Variable"] = 13] = "Variable";
  SymbolKind[SymbolKind["Constant"] = 14] = "Constant";
  SymbolKind[SymbolKind["String"] = 15] = "String";
  SymbolKind[SymbolKind["Number"] = 16] = "Number";
  SymbolKind[SymbolKind["Boolean"] = 17] = "Boolean";
  SymbolKind[SymbolKind["Array"] = 18] = "Array";
  SymbolKind[SymbolKind["Object"] = 19] = "Object";
  SymbolKind[SymbolKind["Key"] = 20] = "Key";
  SymbolKind[SymbolKind["Null"] = 21] = "Null";
  SymbolKind[SymbolKind["EnumMember"] = 22] = "EnumMember";
  SymbolKind[SymbolKind["Struct"] = 23] = "Struct";
  SymbolKind[SymbolKind["Event"] = 24] = "Event";
  SymbolKind[SymbolKind["Operator"] = 25] = "Operator";
  SymbolKind[SymbolKind["TypeParameter"] = 26] = "TypeParameter";
  return SymbolKind;
}(SymbolKind || {});
/** Symbol kinds surfaced from workspace symbol queries (declarations of interest). */
const kinds = [SymbolKind.Class, SymbolKind.Function, SymbolKind.Method, SymbolKind.Interface, SymbolKind.Variable, SymbolKind.Constant, SymbolKind.Struct, SymbolKind.Enum];
/**
 * Mutate the server registry to honor the experimental "ty" Python LSP flag:
 * when enabled, drop pyright; when disabled, drop ty.
 * @param {Object} servers - Map of server id to server definition (mutated in place).
 * @returns {void}
 */
const filterExperimentalServers = servers => {
  if (Flag.CLOSEDCODE_EXPERIMENTAL_LSP_TY) {
    if (servers["pyright"]) {
      log.info("LSP server pyright is disabled because CLOSEDCODE_EXPERIMENTAL_LSP_TY is enabled");
      delete servers["pyright"];
    }
  } else {
    if (servers["ty"]) {
      delete servers["ty"];
    }
  }
};
/** Effect service tag for the LSP service. */
export class Service extends Context.Service()("@closedcode/LSP") {}
/** Effect Layer that builds the LSP service: loads enabled servers from config and exposes LSP operations. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const state = yield* InstanceState.make(Effect.fn("LSP.state")(function* (ctx) {
    const cfg = yield* config.get();
    const servers = {};
    if (!cfg.lsp) {
      log.info("all LSPs are disabled");
    } else {
      for (const server of Object.values(LSPServer)) {
        servers[server.id] = server;
      }
      filterExperimentalServers(servers);
      if (cfg.lsp !== true) {
        for (const [name, item] of Object.entries(cfg.lsp)) {
          const existing = servers[name];
          if (item.disabled) {
            log.info(`LSP server ${name} is disabled`);
            delete servers[name];
            continue;
          }
          servers[name] = {
            ...existing,
            id: name,
            root: existing?.root ?? (async (_file, ctx) => ctx.directory),
            extensions: item.extensions ?? existing?.extensions ?? [],
            spawn: async root => ({
              process: lspspawn(item.command[0], item.command.slice(1), {
                cwd: root,
                env: {
                  ...process.env,
                  ...item.env
                }
              }),
              initialization: item.initialization
            })
          };
        }
      }
      log.info("enabled LSP servers", {
        serverIds: Object.values(servers).map(server => server.id).join(", ")
      });
    }
    const s = {
      clients: [],
      servers,
      broken: new Set(),
      spawning: new Map()
    };
    yield* Effect.addFinalizer(() => Effect.promise(async () => {
      await Promise.all(s.clients.map(client => client.shutdown()));
    }));
    return s;
  }));
  /**
   * Resolve (and lazily spawn) the set of LSP clients that apply to a given file,
   * matching by extension and project root and de-duplicating in-flight spawns.
   * @param {string} file - Absolute path of the file to find clients for.
   * @returns {Promise<Array>} The connected clients applicable to the file.
   */
  const getClients = Effect.fnUntraced(function* (file) {
    const ctx = yield* InstanceState.context;
    if (!containsPath(file, ctx)) return [];
    const s = yield* InstanceState.get(state);
    return yield* Effect.promise(async () => {
      const extension = path.parse(file).ext || file;
      const result = [];
      /**
       * Spawn a server and create its LSP client for a root, tracking failures
       * in the broken set and reusing an existing client if one already exists.
       * @param {Object} server - Server definition with id and spawn function.
       * @param {string} root - Resolved project root directory for the server.
       * @param {string} key - Cache key (root + server id) used to flag broken servers.
       * @returns {Promise<Object>} The created or existing client, or undefined on failure.
       */
      async function schedule(server, root, key) {
        const handle = await server.spawn(root, ctx).then(value => {
          if (!value) s.broken.add(key);
          return value;
        }).catch(err => {
          s.broken.add(key);
          log.error(`Failed to spawn LSP server ${server.id}`, {
            error: err
          });
          return undefined;
        });
        if (!handle) return undefined;
        log.info("spawned lsp server", {
          serverID: server.id,
          root
        });
        const client = await LSPClient.create({
          serverID: server.id,
          server: handle,
          root,
          directory: ctx.directory
        }).catch(async err => {
          s.broken.add(key);
          await Process.stop(handle.process);
          log.error(`Failed to initialize LSP client ${server.id}`, {
            error: err
          });
          return undefined;
        });
        if (!client) return undefined;
        const existing = s.clients.find(x => x.root === root && x.serverID === server.id);
        if (existing) {
          await Process.stop(handle.process);
          return existing;
        }
        s.clients.push(client);
        return client;
      }
      for (const server of Object.values(s.servers)) {
        if (server.extensions.length && !server.extensions.includes(extension)) continue;
        const root = await server.root(file, ctx);
        if (!root) continue;
        if (s.broken.has(root + server.id)) continue;
        const match = s.clients.find(x => x.root === root && x.serverID === server.id);
        if (match) {
          result.push(match);
          continue;
        }
        const inflight = s.spawning.get(root + server.id);
        if (inflight) {
          const client = await inflight;
          if (!client) continue;
          result.push(client);
          continue;
        }
        const task = schedule(server, root, root + server.id);
        s.spawning.set(root + server.id, task);
        task.finally(() => {
          if (s.spawning.get(root + server.id) === task) {
            s.spawning.delete(root + server.id);
          }
        });
        const client = await task;
        if (!client) continue;
        result.push(client);
        Bus.publish(Event.Updated, {});
      }
      return result;
    });
  });
  /**
   * Run a function against every client applicable to a file and collect results.
   * @param {string} file - File whose clients should handle the request.
   * @param {Function} fn - Callback invoked with each client; may return a Promise.
   * @returns {Promise<Array>} Results from each client.
   */
  const run = Effect.fnUntraced(function* (file, fn) {
    const clients = yield* getClients(file);
    return yield* Effect.promise(() => Promise.all(clients.map(x => fn(x))));
  });
  /**
   * Run a function against all currently connected clients and collect results.
   * @param {Function} fn - Callback invoked with each client; may return a Promise.
   * @returns {Promise<Array>} Results from each client.
   */
  const runAll = Effect.fnUntraced(function* (fn) {
    const s = yield* InstanceState.get(state);
    return yield* Effect.promise(() => Promise.all(s.clients.map(x => fn(x))));
  });
  /**
   * Force initialization of the LSP service state (eagerly building the server registry).
   * @returns {void}
   */
  const init = Effect.fn("LSP.init")(function* () {
    yield* InstanceState.get(state);
  });
  /**
   * List the status of every connected client (id, server name, relative root).
   * @returns {Array} Status entries for each connected client.
   */
  const status = Effect.fn("LSP.status")(function* () {
    const ctx = yield* InstanceState.context;
    const s = yield* InstanceState.get(state);
    const result = [];
    for (const client of s.clients) {
      result.push({
        id: client.serverID,
        name: s.servers[client.serverID].id,
        root: path.relative(ctx.directory, client.root),
        status: "connected"
      });
    }
    return result;
  });
  /**
   * Report whether any configured server could handle the given file (by extension and root).
   * @param {string} file - Absolute path of the file to check.
   * @returns {Promise<boolean>} True if at least one non-broken server matches.
   */
  const hasClients = Effect.fn("LSP.hasClients")(function* (file) {
    const ctx = yield* InstanceState.context;
    const s = yield* InstanceState.get(state);
    return yield* Effect.promise(async () => {
      const extension = path.parse(file).ext || file;
      for (const server of Object.values(s.servers)) {
        if (server.extensions.length && !server.extensions.includes(extension)) continue;
        const root = await server.root(file, ctx);
        if (!root) continue;
        if (s.broken.has(root + server.id)) continue;
        return true;
      }
      return false;
    });
  });
  /**
   * Notify applicable clients that a file was opened/changed, optionally waiting for diagnostics.
   * @param {string} input - Absolute path of the file to open/touch.
   * @param {string} diagnostics - When set, the wait mode passed to waitForDiagnostics; falsy skips waiting.
   * @returns {void}
   */
  const touchFile = Effect.fn("LSP.touchFile")(function* (input, diagnostics) {
    log.info("touching file", {
      file: input
    });
    const clients = yield* getClients(input);
    yield* Effect.promise(() => Promise.all(clients.map(async client => {
      const after = Date.now();
      const version = await client.notify.open({
        path: input
      });
      if (!diagnostics) return;
      return client.waitForDiagnostics({
        path: input,
        version,
        mode: diagnostics,
        after
      });
    })).catch(err => {
      log.error("failed to touch file", {
        err,
        file: input
      });
    }));
  });
  /**
   * Aggregate diagnostics across all connected clients, keyed by file path.
   * @returns {Object} Map of file path to an array of diagnostics.
   */
  const diagnostics = Effect.fn("LSP.diagnostics")(function* () {
    const results = {};
    const all = yield* runAll(async client => client.diagnostics);
    for (const result of all) {
      for (const [p, diags] of result.entries()) {
        const arr = results[p] || [];
        arr.push(...diags);
        results[p] = arr;
      }
    }
    return results;
  });
  /**
   * Request hover information at a position via textDocument/hover.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Hover results from each applicable client (null per client on failure).
   */
  const hover = Effect.fn("LSP.hover")(function* (input) {
    return yield* run(input.file, client => client.connection.sendRequest("textDocument/hover", {
      textDocument: {
        uri: pathToFileURL(input.file).href
      },
      position: {
        line: input.line,
        character: input.character
      }
    }).catch(() => null));
  });
  /**
   * Resolve symbol definitions at a position via textDocument/definition.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Flattened list of definition locations.
   */
  const definition = Effect.fn("LSP.definition")(function* (input) {
    const results = yield* run(input.file, client => client.connection.sendRequest("textDocument/definition", {
      textDocument: {
        uri: pathToFileURL(input.file).href
      },
      position: {
        line: input.line,
        character: input.character
      }
    }).catch(() => null));
    return results.flat().filter(Boolean);
  });
  /**
   * Find references to a symbol at a position via textDocument/references (includes the declaration).
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Flattened list of reference locations.
   */
  const references = Effect.fn("LSP.references")(function* (input) {
    const results = yield* run(input.file, client => client.connection.sendRequest("textDocument/references", {
      textDocument: {
        uri: pathToFileURL(input.file).href
      },
      position: {
        line: input.line,
        character: input.character
      },
      context: {
        includeDeclaration: true
      }
    }).catch(() => []));
    return results.flat().filter(Boolean);
  });
  /**
   * Resolve implementations of a symbol at a position via textDocument/implementation.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Flattened list of implementation locations.
   */
  const implementation = Effect.fn("LSP.implementation")(function* (input) {
    const results = yield* run(input.file, client => client.connection.sendRequest("textDocument/implementation", {
      textDocument: {
        uri: pathToFileURL(input.file).href
      },
      position: {
        line: input.line,
        character: input.character
      }
    }).catch(() => null));
    return results.flat().filter(Boolean);
  });
  /**
   * List the symbols declared in a single document via textDocument/documentSymbol.
   * @param {string} uri - File URI of the document to inspect.
   * @returns {Promise<Array>} Flattened list of document symbols.
   */
  const documentSymbol = Effect.fn("LSP.documentSymbol")(function* (uri) {
    const file = fileURLToPath(uri);
    const results = yield* run(file, client => client.connection.sendRequest("textDocument/documentSymbol", {
      textDocument: {
        uri
      }
    }).catch(() => []));
    return results.flat().filter(Boolean);
  });
  /**
   * Search workspace symbols across all clients, keeping interesting kinds and capping results per client.
   * @param {string} query - Symbol name query string.
   * @returns {Promise<Array>} Flattened list of matching workspace symbols (max 10 per client).
   */
  const workspaceSymbol = Effect.fn("LSP.workspaceSymbol")(function* (query) {
    const results = yield* runAll(client => client.connection.sendRequest("workspace/symbol", {
      query
    }).then(result => result.filter(x => kinds.includes(x.kind)).slice(0, 10)).catch(() => []));
    return results.flat();
  });
  /**
   * Prepare call-hierarchy items at a position via textDocument/prepareCallHierarchy.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Flattened list of call-hierarchy items.
   */
  const prepareCallHierarchy = Effect.fn("LSP.prepareCallHierarchy")(function* (input) {
    const results = yield* run(input.file, client => client.connection.sendRequest("textDocument/prepareCallHierarchy", {
      textDocument: {
        uri: pathToFileURL(input.file).href
      },
      position: {
        line: input.line,
        character: input.character
      }
    }).catch(() => []));
    return results.flat().filter(Boolean);
  });
  /**
   * Prepare call-hierarchy at a position then query a direction (incoming/outgoing calls).
   * @param {Object} input - Request location with file, line, and character fields.
   * @param {string} direction - LSP method to query, e.g. "callHierarchy/incomingCalls".
   * @returns {Promise<Array>} Flattened list of call-hierarchy call entries for the first prepared item.
   */
  const callHierarchyRequest = Effect.fnUntraced(function* (input, direction) {
    const results = yield* run(input.file, async client => {
      const items = await client.connection.sendRequest("textDocument/prepareCallHierarchy", {
        textDocument: {
          uri: pathToFileURL(input.file).href
        },
        position: {
          line: input.line,
          character: input.character
        }
      }).catch(() => []);
      if (!items?.length) return [];
      return client.connection.sendRequest(direction, {
        item: items[0]
      }).catch(() => []);
    });
    return results.flat().filter(Boolean);
  });
  /**
   * Find incoming calls to the symbol at a position.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Incoming call entries.
   */
  const incomingCalls = Effect.fn("LSP.incomingCalls")(function* (input) {
    return yield* callHierarchyRequest(input, "callHierarchy/incomingCalls");
  });
  /**
   * Find outgoing calls from the symbol at a position.
   * @param {Object} input - Request location with file, line, and character fields.
   * @returns {Promise<Array>} Outgoing call entries.
   */
  const outgoingCalls = Effect.fn("LSP.outgoingCalls")(function* (input) {
    return yield* callHierarchyRequest(input, "callHierarchy/outgoingCalls");
  });
  return Service.of({
    init,
    status,
    hasClients,
    touchFile,
    diagnostics,
    hover,
    definition,
    references,
    implementation,
    documentSymbol,
    workspaceSymbol,
    prepareCallHierarchy,
    incomingCalls,
    outgoingCalls
  });
}));
/** LSP service layer wired up with the default Config layer. */
export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer));
export * as Diagnostic from "./diagnostic.js";
export * as LSP from "./lsp.js";