/** @file Global SDK context provider: manages the server SSE event stream (with coalescing, batching, heartbeat/reconnect) and SDK client factories. */
import { createSimpleContext } from "@/lib/context.js";
import { createGlobalEmitter } from "../lib/primitives/event-bus.js";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { batch, onCleanup, onMount } from "../lib/reactivity.js";
import z from "zod";
import { createSdkForServer } from "@/utils/server.js";
import { useLanguage } from "./language.js";
import { usePlatform } from "./platform.js";
import { useServer } from "./server.js";
const abortError = z.object({
  name: z.literal("AbortError")
});
/**
 * Global SDK context: owns the SSE event stream to the server, coalesces/batches incoming events,
 * and exposes SDK clients. `useGlobalSDK()` reads the context; `GlobalSDKProvider` provides it.
 * The context value is `{url, client, event: {on, listen, start}, createClient(opts)}`.
 */
export const {
  use: useGlobalSDK,
  provider: GlobalSDKProvider
} = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const language = useLanguage();
    const server = useServer();
    const platform = usePlatform();
    const abort = new AbortController();
    const eventFetch = (() => {
      if (!platform.fetch || !server.current) return;
      try {
        const url = new URL(server.current.http.url);
        const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
        if (url.protocol === "http:" && !loopback) return platform.fetch;
      } catch {
        return;
      }
    })();
    const currentServer = server.current;
    if (!currentServer) throw new Error(language.t("error.globalSDK.noServerAvailable"));
    const eventSdk = createSdkForServer({
      signal: abort.signal,
      fetch: eventFetch,
      server: currentServer.http
    });
    const emitter = createGlobalEmitter();
    const FLUSH_FRAME_MS = 16;
    const STREAM_YIELD_MS = 8;
    const RECONNECT_DELAY_MS = 250;
    let queue = [];
    let buffer = [];
    const coalesced = new Map();
    const staleDeltas = new Set();
    let timer;
    let last = 0;
    /**
     * Build a coalescing key identifying a specific streaming message-part delta.
     * @param {string} directory - Workspace directory the event belongs to.
     * @param {string} messageID - Message id.
     * @param {string} partID - Message part id.
     * @returns {string} Composite delta key.
     */
    const deltaKey = (directory, messageID, partID) => `${directory}:${messageID}:${partID}`;
    /**
     * Compute a coalescing key for event payloads that should overwrite rather than queue duplicates.
     * @param {string} directory - Workspace directory the event belongs to.
     * @param {Object} payload - Event payload.
     * @returns {string} Coalescing key, or undefined if the payload type is not coalesced.
     */
    const key = (directory, payload) => {
      if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`;
      if (payload.type === "lsp.updated") return `lsp.updated:${directory}`;
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part;
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`;
      }
    };
    /**
     * Emit all queued events in a single reactive batch, skipping deltas superseded by a newer part update,
     * then swap the queue/buffer arrays for reuse.
     * @returns {void}
     */
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (queue.length === 0) return;
      const events = queue;
      const skip = staleDeltas.size > 0 ? new Set(staleDeltas) : undefined;
      queue = buffer;
      buffer = events;
      queue.length = 0;
      coalesced.clear();
      staleDeltas.clear();
      last = Date.now();
      batch(() => {
        for (const event of events) {
          if (skip && event.payload.type === "message.part.delta") {
            const props = event.payload.properties;
            if (skip.has(deltaKey(event.directory, props.messageID, props.partID))) continue;
          }
          emitter.emit(event.directory, event.payload);
        }
      });
      buffer.length = 0;
    };
    /**
     * Schedule a flush at most once per ~frame, accounting for time since the last flush.
     * @returns {void}
     */
    const schedule = () => {
      if (timer) return;
      const elapsed = Date.now() - last;
      timer = setTimeout(flush, Math.max(0, FLUSH_FRAME_MS - elapsed));
    };
    let streamErrorLogged = false;
    /**
     * Resolve after a delay.
     * @param {number} ms - Milliseconds to wait.
     * @returns {Promise} Resolves once the delay elapses.
     */
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    /**
     * Test whether an error is an AbortError (expected on intentional aborts).
     * @param {*} error - Caught error.
     * @returns {boolean} True if the error matches the AbortError shape.
     */
    const aborted = error => abortError.safeParse(error).success;
    let attempt;
    let run;
    let started = false;
    const HEARTBEAT_TIMEOUT_MS = 15_000;
    let lastEventAt = Date.now();
    let heartbeat;
    /**
     * Restart the heartbeat timer; if no event arrives within the timeout, abort the current attempt to force reconnect.
     * @returns {void}
     */
    const resetHeartbeat = () => {
      lastEventAt = Date.now();
      if (heartbeat) clearTimeout(heartbeat);
      heartbeat = setTimeout(() => {
        attempt?.abort();
      }, HEARTBEAT_TIMEOUT_MS);
    };
    /**
     * Cancel and clear any pending heartbeat timer.
     * @returns {void}
     */
    const clearHeartbeat = () => {
      if (!heartbeat) return;
      clearTimeout(heartbeat);
      heartbeat = undefined;
    };
    /**
     * Start the long-lived SSE event loop: connect, coalesce/queue incoming events, and auto-reconnect
     * on error or heartbeat timeout until aborted or stopped. Idempotent (returns the existing run).
     * @returns {Promise} The running loop promise.
     */
    const start = () => {
      if (started) return run;
      started = true;
      run = (async () => {
        // oxlint-disable-next-line no-unmodified-loop-condition -- `started` is set to false by stop() which also aborts; both flags are checked to allow graceful exit
        while (!abort.signal.aborted && started) {
          attempt = new AbortController();
          lastEventAt = Date.now();
          const onAbort = () => {
            attempt?.abort();
          };
          abort.signal.addEventListener("abort", onAbort);
          try {
            const events = await eventSdk.global.event({
              signal: attempt.signal,
              onSseError: error => {
                if (aborted(error)) return;
                if (streamErrorLogged) return;
                streamErrorLogged = true;
                console.error("[global-sdk] event stream error", {
                  url: currentServer.http.url,
                  fetch: eventFetch ? "platform" : "webview",
                  error
                });
              }
            });
            let yielded = Date.now();
            resetHeartbeat();
            for await (const event of events.stream) {
              resetHeartbeat();
              streamErrorLogged = false;
              const directory = event.directory ?? "global";
              if (event.payload.type === "sync") {
                continue;
              }
              const payload = event.payload;
              const k = key(directory, payload);
              if (k) {
                const i = coalesced.get(k);
                if (i !== undefined) {
                  queue[i] = {
                    directory,
                    payload
                  };
                  if (payload.type === "message.part.updated") {
                    const part = payload.properties.part;
                    staleDeltas.add(deltaKey(directory, part.messageID, part.id));
                  }
                  continue;
                }
                coalesced.set(k, queue.length);
              }
              queue.push({
                directory,
                payload
              });
              schedule();
              if (Date.now() - yielded < STREAM_YIELD_MS) continue;
              yielded = Date.now();
              await wait(0);
            }
          } catch (error) {
            if (!aborted(error) && !streamErrorLogged) {
              streamErrorLogged = true;
              console.error("[global-sdk] event stream failed", {
                url: currentServer.http.url,
                fetch: eventFetch ? "platform" : "webview",
                error
              });
            }
          } finally {
            abort.signal.removeEventListener("abort", onAbort);
            attempt = undefined;
            clearHeartbeat();
          }
          if (abort.signal.aborted || !started) return;
          await wait(RECONNECT_DELAY_MS);
        }
      })().finally(() => {
        run = undefined;
        flush();
      });
      return run;
    };
    /**
     * Stop the event loop: clear the started flag, abort the in-flight attempt, and clear the heartbeat.
     * @returns {void}
     */
    const stop = () => {
      started = false;
      attempt?.abort();
      clearHeartbeat();
    };
    onMount(() => {
      makeEventListener(document, "visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (!started) return;
        if (Date.now() - lastEventAt < HEARTBEAT_TIMEOUT_MS) return;
        attempt?.abort();
      });
    });
    onCleanup(() => {
      stop();
      abort.abort();
      flush();
    });
    const sdk = createSdkForServer({
      server: server.current.http,
      fetch: platform.fetch,
      throwOnError: true
    });
    return {
      url: currentServer.http.url,
      client: sdk,
      event: {
        on: emitter.on.bind(emitter),
        listen: emitter.listen.bind(emitter),
        start
      },
      /**
       * Create a fresh SDK client bound to the current server, merging in caller options (e.g. `directory`).
       * @param {Object} opts - Extra options spread onto the SDK client config.
       * @returns {Object} A configured SDK client.
       */
      createClient(opts) {
        const s = server.current;
        if (!s) throw new Error(language.t("error.globalSDK.serverNotAvailable"));
        return createSdkForServer({
          server: s.http,
          fetch: platform.fetch,
          ...opts
        });
      }
    };
  }
});