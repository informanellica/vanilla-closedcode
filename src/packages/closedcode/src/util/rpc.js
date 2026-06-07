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
export function emit(event, data) {
  postMessage(JSON.stringify({
    type: "rpc.event",
    event,
    data
  }));
}
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