/** @file Language Server Protocol client: drives the JSON-RPC handshake with a language server, tracks push/pull diagnostics, and exposes open/wait/shutdown operations. */
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { Instance } from "#project/instance.js";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node.js";
import * as Log from "core/util/log";
import { Process } from "#util/process.js";
import { LANGUAGE_EXTENSIONS } from "./language.js";
import z from "zod";
import { Schema } from "effect";
import { NamedError } from "core/util/error";
import { withTimeout } from "../util/timeout.js";
import { Filesystem } from "#util/filesystem.js";
const DIAGNOSTICS_DEBOUNCE_MS = 150;
const DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS = 5_000;
const DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS = 10_000;
const DIAGNOSTICS_REQUEST_TIMEOUT_MS = 3_000;
const INITIALIZE_TIMEOUT_MS = 45_000;

// LSP spec constants
const FILE_CHANGE_CREATED = 1;
const FILE_CHANGE_CHANGED = 2;
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2;
const log = Log.create({
  service: "lsp.client"
});
/** Error thrown when the LSP initialize handshake fails or times out; carries the server ID. */
export const InitializeError = NamedError.create("LSPInitializeError", z.object({
  serverID: z.string()
}));
/** Bus events emitted by the LSP client (e.g. diagnostics updated for a path). */
export const Event = {
  Diagnostics: BusEvent.define("lsp.client.diagnostics", Schema.Struct({
    serverID: Schema.String,
    path: Schema.String
  }))
};
/**
 * Convert a file:// URI to a normalized local filesystem path.
 * @param {string} uri - The document URI.
 * @returns {string} The normalized path, or undefined when uri is not a file:// URI.
 */
function getFilePath(uri) {
  if (!uri.startsWith("file://")) return;
  return Filesystem.normalizePath(fileURLToPath(uri));
}
/**
 * Extract the text-document sync kind from server capabilities.
 * @param {Object} capabilities - The server's reported capabilities.
 * @returns {number} The sync kind, or undefined when not advertised.
 */
function getSyncKind(capabilities) {
  if (!capabilities) return;
  const sync = capabilities.textDocumentSync;
  if (typeof sync === "number") return sync;
  return sync?.change;
}
/**
 * Compute the LSP position at the end of a block of text.
 * @param {string} text - The document text.
 * @returns {Object} A position {line, character} pointing past the last character.
 */
function endPosition(text) {
  const lines = text.split(/\r\n|\r|\n/);
  return {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0
  };
}
/**
 * Remove duplicate diagnostics, keying on code/severity/message/source/range.
 * @param {Array} items - Diagnostics to deduplicate.
 * @returns {Array} The list with duplicates removed (first occurrence kept).
 */
function dedupeDiagnostics(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = JSON.stringify({
      code: item.code,
      severity: item.severity,
      message: item.message,
      source: item.source,
      range: item.range
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/**
 * Resolve a dotted configuration section from a settings object, for
 * answering workspace/configuration requests.
 * @param {Object} settings - The full settings object.
 * @param {string} section - Dotted section path (e.g. "typescript.format"); falsy returns the whole settings.
 * @returns {*} The resolved value, or null when the section is absent.
 */
function configurationValue(settings, section) {
  if (!section) return settings ?? null;
  const result = section.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object" || !(key in acc)) return undefined;
    return acc[key];
  }, settings);
  return result ?? null;
}

// TypeScript's built-in LSP pushes diagnostics aggressively on first open.
// We seed the push cache on the very first publish so waitForFreshPush can
// resolve immediately instead of waiting for a second debounced push.
/**
 * Whether to seed the push-diagnostics cache on the server's first publish.
 * @param {string} serverID - The language server identifier.
 * @returns {boolean} True for servers (currently "typescript") that push eagerly on open.
 */
function shouldSeedDiagnosticsOnFirstPush(serverID) {
  return serverID === "typescript";
}
/**
 * Create and initialize an LSP client over a server process's stdio.
 * Sets up JSON-RPC handlers, performs the initialize handshake, tracks diagnostics,
 * and returns the public client API.
 * @param {Object} input - Client inputs: {serverID, server, root, directory}.
 * @returns {Promise<Object>} The client API ({root, serverID, connection, notify, diagnostics, waitForDiagnostics, shutdown}).
 * @throws {InitializeError} When the initialize request fails or times out.
 */
export async function create(input) {
  const logger = log.clone().tag("serverID", input.serverID);
  logger.info("starting client");
  const connection = createMessageConnection(new StreamMessageReader(input.server.process.stdout), new StreamMessageWriter(input.server.process.stdin));
  // Server stderr can contain both real errors and routine informational logs,
  // which is normal stderr practice for some tools. Keep the raw stream at
  // debug so users can opt in with --print-logs --log-level DEBUG without
  // polluting normal logs.
  input.server.process.stderr?.on("data", data => {
    const text = data.toString().trim();
    if (text) logger.debug("server stderr", {
      text: text.slice(0, 1000)
    });
  });

  // --- Connection state ---

  const pushDiagnostics = new Map();
  const pullDiagnostics = new Map();
  const published = new Map();
  const diagnosticRegistrations = new Map();
  const registrationListeners = new Set();
  const mergedDiagnostics = filePath => dedupeDiagnostics([...(pushDiagnostics.get(filePath) ?? []), ...(pullDiagnostics.get(filePath) ?? [])]);
  const updatePushDiagnostics = (filePath, next) => {
    pushDiagnostics.set(filePath, next);
    Bus.publish(Event.Diagnostics, {
      path: filePath,
      serverID: input.serverID
    });
  };
  const updatePullDiagnostics = (filePath, next) => {
    pullDiagnostics.set(filePath, next);
  };
  const emitRegistrationChange = () => {
    for (const listener of [...registrationListeners]) listener();
  };

  // --- LSP connection handlers ---

  // vscode-jsonrpc dispatches notifications via stdin data events that don't
  // preserve the Instance ALS context the client was created in. updatePushDiagnostics
  // calls Bus.publish which needs Instance.current, so capture the context at
  // registration and restore it for every callback invocation.
  connection.onNotification("textDocument/publishDiagnostics", Instance.bind(params => {
    const filePath = getFilePath(params.uri);
    if (!filePath) return;
    logger.info("textDocument/publishDiagnostics", {
      path: filePath,
      count: params.diagnostics.length,
      version: params.version
    });
    published.set(filePath, {
      at: Date.now(),
      version: typeof params.version === "number" ? params.version : undefined
    });
    if (shouldSeedDiagnosticsOnFirstPush(input.serverID) && !pushDiagnostics.has(filePath)) {
      pushDiagnostics.set(filePath, params.diagnostics);
      return;
    }
    updatePushDiagnostics(filePath, params.diagnostics);
  }));
  connection.onRequest("window/workDoneProgress/create", params => {
    logger.info("window/workDoneProgress/create", params);
    return null;
  });
  connection.onRequest("workspace/configuration", async params => {
    const items = params.items ?? [];
    return items.map(item => configurationValue(input.server.initialization, item.section));
  });
  connection.onRequest("client/registerCapability", async params => {
    const registrations = params.registrations ?? [];
    let changed = false;
    for (const registration of registrations) {
      if (registration.method !== "textDocument/diagnostic") continue;
      diagnosticRegistrations.set(registration.id, registration);
      changed = true;
    }
    if (changed) emitRegistrationChange();
  });
  connection.onRequest("client/unregisterCapability", async params => {
    const registrations = params.unregisterations ?? [];
    let changed = false;
    for (const registration of registrations) {
      if (registration.method !== "textDocument/diagnostic") continue;
      diagnosticRegistrations.delete(registration.id);
      changed = true;
    }
    if (changed) emitRegistrationChange();
  });
  connection.onRequest("workspace/workspaceFolders", async () => [{
    name: "workspace",
    uri: pathToFileURL(input.root).href
  }]);
  connection.onRequest("workspace/diagnostic/refresh", async () => null);
  connection.listen();

  // --- Initialize handshake ---

  logger.info("sending initialize");
  const initialized = await withTimeout(connection.sendRequest("initialize", {
    rootUri: pathToFileURL(input.root).href,
    processId: input.server.process.pid,
    workspaceFolders: [{
      name: "workspace",
      uri: pathToFileURL(input.root).href
    }],
    initializationOptions: {
      ...input.server.initialization
    },
    capabilities: {
      window: {
        workDoneProgress: true
      },
      workspace: {
        configuration: true,
        didChangeWatchedFiles: {
          dynamicRegistration: true
        },
        diagnostics: {
          refreshSupport: false
        }
      },
      textDocument: {
        synchronization: {
          didOpen: true,
          didChange: true
        },
        diagnostic: {
          dynamicRegistration: true,
          relatedDocumentSupport: true
        },
        publishDiagnostics: {
          versionSupport: false
        }
      }
    }
  }), INITIALIZE_TIMEOUT_MS).catch(err => {
    logger.error("initialize error", {
      error: err
    });
    throw new InitializeError({
      serverID: input.serverID
    }, {
      cause: err
    });
  });
  const syncKind = getSyncKind(initialized.capabilities);
  const hasStaticPullDiagnostics = Boolean(initialized.capabilities?.diagnosticProvider);
  await connection.sendNotification("initialized", {});
  if (input.server.initialization) {
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: input.server.initialization
    });
  }
  const files = {};

  // --- Diagnostic helpers ---

  /**
   * Merge several pull-diagnostic results into the pull cache, keyed by file.
   * @param {string} filePath - The file the diagnostics were requested for.
   * @param {Array} results - Per-request results, each {handled, matched, byFile}.
   * @returns {Object} Combined {handled, matched} flags.
   */
  const mergeResults = (filePath, results) => {
    const handled = results.some(result => result.handled);
    const matched = results.some(result => result.matched);
    if (!handled) return {
      handled: false,
      matched: false
    };
    const merged = new Map();
    for (const result of results) {
      for (const [target, items] of result.byFile.entries()) {
        const existing = merged.get(target) ?? [];
        merged.set(target, existing.concat(items));
      }
    }
    if (matched && !merged.has(filePath)) merged.set(filePath, []);
    for (const [target, items] of merged.entries()) {
      updatePullDiagnostics(target, dedupeDiagnostics(items));
    }
    return {
      handled,
      matched
    };
  };
  /**
   * Request a document diagnostic report (textDocument/diagnostic) for one file.
   * @param {string} filePath - The file to request diagnostics for.
   * @param {string} identifier - Optional pull-diagnostics identifier.
   * @returns {Promise<Object>} {handled, matched, byFile} where byFile maps paths to diagnostic arrays.
   */
  async function requestDiagnosticReport(filePath, identifier) {
    const report = await withTimeout(connection.sendRequest("textDocument/diagnostic", {
      ...(identifier ? {
        identifier
      } : {}),
      textDocument: {
        uri: pathToFileURL(filePath).href
      }
    }), DIAGNOSTICS_REQUEST_TIMEOUT_MS).catch(() => null);
    if (!report) return {
      handled: false,
      matched: false,
      byFile: new Map()
    };
    const byFile = new Map();
    const push = (target, items) => {
      const existing = byFile.get(target) ?? [];
      byFile.set(target, existing.concat(items));
    };
    let handled = false;
    let matched = false;
    if (Array.isArray(report.items)) {
      push(filePath, report.items);
      handled = true;
      matched = true;
    }
    for (const [uri, related] of Object.entries(report.relatedDocuments ?? {})) {
      const relatedPath = getFilePath(uri);
      if (!relatedPath || !Array.isArray(related.items)) continue;
      push(relatedPath, related.items);
      handled = true;
      matched = matched || relatedPath === filePath;
    }
    return {
      handled,
      matched,
      byFile
    };
  }
  /**
   * Request a workspace diagnostic report (workspace/diagnostic) spanning all files.
   * @param {string} filePath - The file of interest, used to set the matched flag.
   * @param {string} identifier - Optional pull-diagnostics identifier.
   * @returns {Promise<Object>} {handled, matched, byFile} where byFile maps paths to diagnostic arrays.
   */
  async function requestWorkspaceDiagnosticReport(filePath, identifier) {
    const report = await withTimeout(connection.sendRequest("workspace/diagnostic", {
      ...(identifier ? {
        identifier
      } : {}),
      previousResultIds: []
    }), DIAGNOSTICS_REQUEST_TIMEOUT_MS).catch(() => null);
    if (!report) return {
      handled: false,
      matched: false,
      byFile: new Map()
    };
    const byFile = new Map();
    let matched = false;
    for (const item of report.items ?? []) {
      const relatedPath = item.uri ? getFilePath(item.uri) : undefined;
      if (!relatedPath || !Array.isArray(item.items)) continue;
      const existing = byFile.get(relatedPath) ?? [];
      byFile.set(relatedPath, existing.concat(item.items));
      matched = matched || relatedPath === filePath;
    }
    return {
      handled: true,
      matched,
      byFile
    };
  }
  /**
   * Inspect dynamic registrations to learn whether document-level pull diagnostics
   * are supported and which identifiers to query.
   * @returns {Object} {documentIdentifiers, supported}.
   */
  function documentPullState() {
    const documentRegistrations = [...diagnosticRegistrations.values()].filter(registration => registration.registerOptions?.workspaceDiagnostics !== true);
    return {
      documentIdentifiers: [...new Set(documentRegistrations.flatMap(registration => registration.registerOptions?.identifier ?? []))],
      supported: hasStaticPullDiagnostics || documentRegistrations.length > 0
    };
  }
  /**
   * Inspect dynamic registrations to learn whether workspace-level pull diagnostics
   * are supported and which identifiers to query.
   * @returns {Object} {workspaceIdentifiers, supported}.
   */
  function workspacePullState() {
    const workspaceRegistrations = [...diagnosticRegistrations.values()].filter(registration => registration.registerOptions?.workspaceDiagnostics === true);
    return {
      workspaceIdentifiers: [...new Set(workspaceRegistrations.flatMap(registration => registration.registerOptions?.identifier ?? []))],
      supported: workspaceRegistrations.length > 0
    };
  }
  /**
   * Whether any result already contains at least one diagnostic for the given file.
   * @param {string} filePath - The file to check.
   * @param {Array} results - Accumulated per-request results with byFile maps.
   * @returns {boolean} True when the file has diagnostics in some result.
   */
  const hasCurrentFileDiagnostics = (filePath, results) => results.some(result => (result.byFile.get(filePath)?.length ?? 0) > 0);
  /**
   * Run several diagnostic requests in parallel, resolving early once the `done`
   * predicate is satisfied and finally once all requests settle.
   * @param {string} filePath - The file diagnostics are being collected for.
   * @param {Array<Promise>} requests - In-flight diagnostic-report promises.
   * @param {Function} done - Predicate(results) deciding whether to resolve early.
   * @returns {Promise<Object>} The merged {handled, matched} result.
   */
  async function requestDiagnostics(filePath, requests, done) {
    if (!requests.length) return {
      handled: false,
      matched: false
    };
    const results = [];
    return new Promise(resolve => {
      let pending = requests.length;
      let resolved = false;
      const finish = (merged, force = false) => {
        if (resolved) return;
        if (!force && !done(results)) return;
        resolved = true;
        resolve(merged);
      };
      for (const request of requests) {
        request.then(result => {
          results.push(result);
          pending -= 1;
          const merged = mergeResults(filePath, results);
          finish(merged);
          if (pending === 0) finish(merged, true);
        });
      }
    });
  }

  // LATENCY-CRITICAL: dispatch identifier pulls in parallel and unblock once one
  // batch already produced diagnostics for the current file. Let slower pulls keep
  // merging in the background; do not sequence identifier-by-identifier, and do
  // not add a post-match settle/debounce delay. See PR #23771.
  /**
   * Pull document-level diagnostics for a file across all registered identifiers,
   * unblocking as soon as one batch yields diagnostics for that file.
   * @param {string} filePath - The file to pull diagnostics for.
   * @returns {Promise<Object>} {handled, matched} (unsupported -> both false).
   */
  async function requestDocumentDiagnostics(filePath) {
    const state = documentPullState();
    if (!state.supported) return {
      handled: false,
      matched: false
    };
    return requestDiagnostics(filePath, [requestDiagnosticReport(filePath), ...state.documentIdentifiers.map(identifier => requestDiagnosticReport(filePath, identifier))], results => hasCurrentFileDiagnostics(filePath, results));
  }
  /**
   * Pull both document- and workspace-level diagnostics for a file across every
   * supported registration, merging all results.
   * @param {string} filePath - The file to pull diagnostics for.
   * @returns {Promise<Object>} {handled, matched} (nothing supported -> both false).
   */
  async function requestFullDiagnostics(filePath) {
    const documentState = documentPullState();
    const workspaceState = workspacePullState();
    if (!documentState.supported && !workspaceState.supported) return {
      handled: false,
      matched: false
    };
    return mergeResults(filePath, await Promise.all([...(documentState.supported ? [requestDiagnosticReport(filePath)] : []), ...documentState.documentIdentifiers.map(identifier => requestDiagnosticReport(filePath, identifier)), ...(workspaceState.supported ? [requestWorkspaceDiagnosticReport(filePath)] : []), ...workspaceState.workspaceIdentifiers.map(identifier => requestWorkspaceDiagnosticReport(filePath, identifier))]));
  }
  /**
   * Wait until a dynamic diagnostic capability registration changes, or a timeout elapses.
   * @param {number} timeout - Maximum time to wait in milliseconds.
   * @returns {Promise<boolean>} True if a registration change occurred, false on timeout.
   */
  function waitForRegistrationChange(timeout) {
    if (timeout <= 0) return Promise.resolve(false);
    return new Promise(resolve => {
      let finished = false;
      let timer;
      const finish = result => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        registrationListeners.delete(listener);
        resolve(result);
      };
      const listener = () => finish(true);
      registrationListeners.add(listener);
      timer = setTimeout(() => finish(false), timeout);
    });
  }
  /**
   * Wait for a fresh push-diagnostics publish for a path, debounced, matching the
   * requested version and only counting publishes after the request started.
   * @param {Object} request - {path, version, after, timeout}.
   * @returns {Promise<boolean>} True when a qualifying push arrived, false on timeout.
   */
  function waitForFreshPush(request) {
    if (request.timeout <= 0) return Promise.resolve(false);
    return new Promise(resolve => {
      let finished = false;
      let debounceTimer;
      let timeoutTimer;
      let unsub;
      const finish = result => {
        if (finished) return;
        finished = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        unsub?.();
        resolve(result);
      };
      const schedule = () => {
        const hit = published.get(request.path);
        if (!hit) return;
        if (typeof hit.version === "number" && hit.version !== request.version) return;
        if (hit.at < request.after && hit.version !== request.version) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => finish(true), Math.max(0, DIAGNOSTICS_DEBOUNCE_MS - (Date.now() - hit.at)));
      };
      timeoutTimer = setTimeout(() => finish(false), request.timeout);
      unsub = Bus.subscribe(Event.Diagnostics, event => {
        if (event.properties.path !== request.path || event.properties.serverID !== input.serverID) return;
        schedule();
      });
      schedule();
    });
  }
  /**
   * Wait until document-level diagnostics for a file are available (via pull or push),
   * retrying on push/registration signals until matched or timed out.
   * @param {Object} request - {path, version, after}.
   * @returns {Promise<void>} Resolves once matched or the wait window elapses.
   */
  async function waitForDocumentDiagnostics(request) {
    const startedAt = request.after ?? Date.now();
    const pushWait = waitForFreshPush({
      path: request.path,
      version: request.version,
      after: startedAt,
      timeout: DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS
    });
    while (Date.now() - startedAt < DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS) {
      const result = await requestDocumentDiagnostics(request.path);
      if (result.matched) return;
      const remaining = DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) return;
      const next = await Promise.race([pushWait.then(ready => ready ? "push" : "timeout"), waitForRegistrationChange(remaining).then(changed => changed ? "registration" : "timeout")]);
      if (next !== "registration") return;
    }
  }
  /**
   * Wait until full (document + workspace) diagnostics for a file are available,
   * retrying on push/registration signals until handled/matched or timed out.
   * @param {Object} request - {path, version, after}.
   * @returns {Promise<void>} Resolves once handled/matched or the wait window elapses.
   */
  async function waitForFullDiagnostics(request) {
    const startedAt = request.after ?? Date.now();
    const pushWait = waitForFreshPush({
      path: request.path,
      version: request.version,
      after: startedAt,
      timeout: DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS
    });
    while (Date.now() - startedAt < DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS) {
      const result = await requestFullDiagnostics(request.path);
      if (result.handled || result.matched) return;
      const remaining = DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) return;
      const next = await Promise.race([pushWait.then(ready => ready ? "push" : "timeout"), waitForRegistrationChange(remaining).then(changed => changed ? "registration" : "timeout")]);
      if (next !== "registration") return;
    }
  }

  // --- Public API ---

  /** The public LSP client API returned by create(). */
  const result = {
    root: input.root,
    get serverID() {
      return input.serverID;
    },
    get connection() {
      return connection;
    },
    notify: {
      /**
       * Notify the server that a file was opened or changed, sending didOpen on first
       * sight and didChange (plus a watched-files change) thereafter.
       * @param {Object} request - {path}; the path is normalized and resolved against the instance directory.
       * @returns {Promise<number>} The document version after the notification.
       */
      async open(request) {
        request.path = Filesystem.normalizePath(path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path));
        const text = await Filesystem.readText(request.path);
        const extension = path.extname(request.path);
        const languageId = LANGUAGE_EXTENSIONS[extension] ?? "plaintext";
        const document = files[request.path];
        if (document !== undefined) {
          // Do not wipe diagnostics on didChange. Some servers (e.g. clangd) only
          // re-emit diagnostics when the content actually changes, so clearing
          // here would lose errors for no-op touchFile calls. Let the server's
          // next push/pull overwrite naturally.
          logger.info("workspace/didChangeWatchedFiles", request);
          await connection.sendNotification("workspace/didChangeWatchedFiles", {
            changes: [{
              uri: pathToFileURL(request.path).href,
              type: FILE_CHANGE_CHANGED
            }]
          });
          const next = document.version + 1;
          files[request.path] = {
            version: next,
            text
          };
          logger.info("textDocument/didChange", {
            path: request.path,
            version: next
          });
          await connection.sendNotification("textDocument/didChange", {
            textDocument: {
              uri: pathToFileURL(request.path).href,
              version: next
            },
            contentChanges: syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL ? [{
              range: {
                start: {
                  line: 0,
                  character: 0
                },
                end: endPosition(document.text)
              },
              text
            }] : [{
              text
            }]
          });
          return next;
        }
        logger.info("workspace/didChangeWatchedFiles", request);
        await connection.sendNotification("workspace/didChangeWatchedFiles", {
          changes: [{
            uri: pathToFileURL(request.path).href,
            type: FILE_CHANGE_CREATED
          }]
        });
        logger.info("textDocument/didOpen", request);
        pushDiagnostics.delete(request.path);
        pullDiagnostics.delete(request.path);
        await connection.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri: pathToFileURL(request.path).href,
            languageId,
            version: 0,
            text
          }
        });
        files[request.path] = {
          version: 0,
          text
        };
        return 0;
      }
    },
    /**
     * Current merged (push + pull, deduplicated) diagnostics for every tracked file.
     * @returns {Map} Map of file path to diagnostic array.
     */
    get diagnostics() {
      const result = new Map();
      for (const key of new Set([...pushDiagnostics.keys(), ...pullDiagnostics.keys()])) {
        result.set(key, mergedDiagnostics(key));
      }
      return result;
    },
    /**
     * Wait for diagnostics to become available for a file, in "document" or "full" mode.
     * @param {Object} request - {path, mode, version, after}; path is normalized/resolved.
     * @returns {Promise<void>} Resolves when diagnostics are ready or the wait window elapses.
     */
    async waitForDiagnostics(request) {
      const normalizedPath = Filesystem.normalizePath(path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path));
      logger.info("waiting for diagnostics", {
        path: normalizedPath,
        mode: request.mode ?? "full",
        version: request.version
      });
      if (request.mode === "document") {
        await waitForDocumentDiagnostics({
          path: normalizedPath,
          version: request.version,
          after: request.after
        });
        return;
      }
      await waitForFullDiagnostics({
        path: normalizedPath,
        version: request.version,
        after: request.after
      });
    },
    /**
     * Close the JSON-RPC connection and stop the underlying server process.
     * @returns {Promise<void>} Resolves once the connection and process have stopped.
     */
    async shutdown() {
      logger.info("shutting down");
      connection.end();
      connection.dispose();
      await Process.stop(input.server.process);
      logger.info("shutdown");
    }
  };
  logger.info("initialized");
  return result;
}
export * as LSPClient from "./client.js";