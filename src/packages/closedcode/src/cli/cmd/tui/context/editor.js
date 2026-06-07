import { onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import z from "zod";
import { createSimpleContext } from "./helper.js";
import { resolveZedDbPath, resolveZedSelection } from "./editor-zed.js";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const JsonRpcMessageSchema = z.object({
  id: z.union([z.number(), z.string(), z.null()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional()
  }).optional()
});
const PositionSchema = z.object({
  line: z.number(),
  character: z.number()
});
const EditorSelectionRangeSchema = z.object({
  text: z.string(),
  selection: z.object({
    start: PositionSchema,
    end: PositionSchema
  })
});
const EditorSelectionSchema = z.union([z.object({
  filePath: z.string(),
  source: z.enum(["websocket", "zed"]).optional(),
  ranges: z.array(EditorSelectionRangeSchema).min(1)
}), z.object({
  text: z.string(),
  filePath: z.string(),
  source: z.enum(["websocket", "zed"]).optional(),
  selection: z.object({
    start: PositionSchema,
    end: PositionSchema
  })
})]).transform(value => "ranges" in value ? value : {
  filePath: value.filePath,
  source: value.source,
  ranges: [{
    text: value.text,
    selection: value.selection
  }]
});
const EditorMentionSchema = z.object({
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number()
});
const EditorServerInfoSchema = z.object({
  protocolVersion: z.string().optional(),
  serverInfo: z.object({
    name: z.string().optional(),
    version: z.string().optional()
  }).optional()
});
export const {
  use: useEditorContext,
  provider: EditorContextProvider
} = createSimpleContext({
  name: "EditorContext",
  init: props => {
    const mentionListeners = new Set();
    const WebSocketImpl = props.WebSocketImpl ?? WebSocket;
    const [store, setStore] = createStore({
      status: "disabled",
      selection: undefined,
      server: undefined
    });
    let socket;
    let closed = false;
    let reconnect;
    let attempt = 0;
    let requestID = 0;
    let zedSelection;
    let lastZedSelectionKey;
    let directory = process.cwd();
    const pending = new Map();
    const send = payload => {
      if (!socket || socket.readyState !== 1) return;
      socket.send(JSON.stringify({
        jsonrpc: "2.0",
        ...payload
      }));
    };
    const request = (method, params) => {
      requestID += 1;
      pending.set(requestID, method);
      send({
        id: requestID,
        method,
        params
      });
    };
    const connect = () => {
      if (closed) return;
      const connection = resolveEditorConnection(directory);
      if (!connection) {
        const dbPath = resolveZedDbPath();
        if (!dbPath) {
          setStore("status", "disabled");
          scheduleReconnect();
          return;
        }
        zedSelection ??= resolveZedSelection(dbPath, directory).then(result => {
          if (closed || socket) return;
          if (result.type === "unavailable") return;
          const selection = result.type === "selection" ? result.selection : undefined;
          const key = editorSelectionKey(selection);
          if (key !== lastZedSelectionKey) {
            lastZedSelectionKey = key;
            setStore("selection", selection);
            setStore("status", selection ? "connected" : "disabled");
          }
        }).catch(() => {
          // Keep the last known Zed selection for transient polling failures.
        }).finally(() => {
          zedSelection = undefined;
        });
        scheduleZedPoll();
        return;
      }
      setStore("status", "connecting");
      const current = openEditorSocket(connection, WebSocketImpl);
      socket = current;
      current.addEventListener("open", () => {
        if (socket !== current) {
          current.close();
          return;
        }
        attempt = 0;
        setStore("status", "connected");
        request("initialize", {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "closedcode",
            version: "0.0.0"
          }
        });
      });
      current.addEventListener("message", event => {
        const message = parseMessage(event.data);
        if (!message) return;
        const selection = message.method === "selection_changed" ? EditorSelectionSchema.safeParse(message.params) : undefined;
        if (selection?.success) {
          setStore("selection", {
            ...selection.data,
            source: "websocket"
          });
          return;
        }
        const mention = message.method === "at_mentioned" ? EditorMentionSchema.safeParse(message.params) : undefined;
        if (mention?.success) {
          mentionListeners.forEach(listener => listener(mention.data));
          return;
        }
        if (typeof message.id !== "number") return;
        const method = pending.get(message.id);
        if (!method) return;
        pending.delete(message.id);
        if (message.error) return;
        const initialize = method === "initialize" ? EditorServerInfoSchema.safeParse(message.result) : undefined;
        if (initialize?.success) {
          setStore("server", initialize.data);
          send({
            method: "notifications/initialized"
          });
          return;
        }
      });
      current.addEventListener("close", () => {
        if (socket !== current) return;
        socket = undefined;
        pending.clear();
        if (closed) return;
        setStore("status", "connecting");
        scheduleReconnect();
      });
    };
    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnect) clearTimeout(reconnect);
      attempt += 1;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
      reconnect = setTimeout(connect, delay);
    };
    const scheduleZedPoll = () => {
      if (closed) return;
      if (reconnect) clearTimeout(reconnect);
      reconnect = setTimeout(connect, 1000);
    };
    const reconnectWithDirectory = nextDirectory => {
      const resolved = nextDirectory || process.cwd();
      if (directory === resolved) return;
      directory = resolved;
      attempt = 0;
      pending.clear();
      lastZedSelectionKey = undefined;
      if (reconnect) clearTimeout(reconnect);
      reconnect = undefined;
      if (socket) {
        const current = socket;
        socket = undefined;
        current.close();
      }
      setStore("status", "disabled");
      setStore("selection", undefined);
      setStore("server", undefined);
      connect();
    };
    onMount(() => {
      connect();
      onCleanup(() => {
        closed = true;
        if (reconnect) clearTimeout(reconnect);
        socket?.close();
      });
    });
    return {
      enabled() {
        return Boolean(resolveEditorConnection(directory) || resolveZedDbPath());
      },
      connected() {
        return store.status === "connected";
      },
      selection() {
        return store.selection;
      },
      clearSelection() {
        lastZedSelectionKey = undefined;
        setStore("selection", undefined);
      },
      onMention(listener) {
        mentionListeners.add(listener);
        return () => mentionListeners.delete(listener);
      },
      server() {
        return store.server;
      },
      reconnect(directory) {
        setStore("selection", undefined);
        reconnectWithDirectory(directory);
      }
    };
  }
});
function parsePort(value) {
  if (!value) return;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return;
  return parsed;
}
function resolveEditorConnection(_directory) {
  const port = parsePort(process.env.CLOSEDCODE_EDITOR_SSE_PORT);
  if (port) {
    return {
      url: `ws://127.0.0.1:${port}`,
      source: `env:${port}`
    };
  }
}
export function editorSelectionKey(selection) {
  if (!selection) return "";
  return [selection.filePath, ...selection.ranges.flatMap(range => [range.selection.start.line, range.selection.start.character, range.selection.end.line, range.selection.end.character, range.text])].join("\0");
}
function openEditorSocket(connection, WebSocketImpl) {
  return new WebSocketImpl(connection.url);
}
function parseMessage(value) {
  if (typeof value !== "string") return;
  try {
    return JsonRpcMessageSchema.parse(JSON.parse(value));
  } catch {
    return;
  }
}