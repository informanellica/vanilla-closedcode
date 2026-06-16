/** @file Minimal JSON message-passing RPC over Worker/MessagePort-style endpoints (server, event emit, and client). */

/**
 * Install a worker-side message handler that dispatches "rpc.request" messages to
 * methods on the given handler object and posts back their results.
 * @param {Object} rpc - An object whose method names are the callable RPC methods; each receives the request input.
 * @returns {void}
 */
export function listen(rpc) {
  onmessage = async evt => {
    const parsed = JSON.parse(evt.data);
    if (parsed.type === "rpc.request") {
      const result = await rpc[parsed.method](parsed.input);
      postMessage(JSON.stringify({
        type: "rpc.result",
        result,
        id: parsed.id
      }));
    }
  };
}
/**
 * Post an "rpc.event" message from the worker side to subscribed clients.
 * @param {string} event - The event name.
 * @param {*} data - The event payload.
 * @returns {void}
 */
export function emit(event, data) {
  postMessage(JSON.stringify({
    type: "rpc.event",
    event,
    data
  }));
}
/**
 * Create a client bound to a target endpoint (e.g. a Worker), wiring up its
 * `onmessage` to resolve pending calls and dispatch events to subscribers.
 * @param {Object} target - An object exposing `postMessage` and an assignable `onmessage` (Worker/MessagePort-like).
 * @returns {{call: Function, on: Function}} A client with `call(method, input)` returning a Promise and `on(event, handler)` returning an unsubscribe function.
 */
export function client(target) {
  const pending = new Map();
  const listeners = new Map();
  let id = 0;
  target.onmessage = async evt => {
    const parsed = JSON.parse(evt.data);
    if (parsed.type === "rpc.result") {
      const resolve = pending.get(parsed.id);
      if (resolve) {
        resolve(parsed.result);
        pending.delete(parsed.id);
      }
    }
    if (parsed.type === "rpc.event") {
      const handlers = listeners.get(parsed.event);
      if (handlers) {
        for (const handler of handlers) {
          handler(parsed.data);
        }
      }
    }
  };
  return {
    /**
     * Invoke a remote RPC method and resolve with its result.
     * @param {string} method - The remote method name to call.
     * @param {*} input - The argument passed to the remote method.
     * @returns {Promise<*>} Resolves with the method's result.
     */
    call(method, input) {
      const requestId = id++;
      return new Promise(resolve => {
        pending.set(requestId, resolve);
        target.postMessage(JSON.stringify({
          type: "rpc.request",
          method,
          input,
          id: requestId
        }));
      });
    },
    /**
     * Subscribe to a remote event.
     * @param {string} event - The event name to listen for.
     * @param {Function} handler - Callback invoked with each event's data payload.
     * @returns {Function} An unsubscribe function that removes the handler.
     */
    on(event, handler) {
      let handlers = listeners.get(event);
      if (!handlers) {
        handlers = new Set();
        listeners.set(event, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }
  };
}
export * as Rpc from "./rpc.js";