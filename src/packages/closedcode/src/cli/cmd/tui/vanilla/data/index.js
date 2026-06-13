// Vanilla data layer (SDK-integration phase): the store + the SDK-driven actions
// and event loop, replacing the solid-js context stack (sync/sdk/local) for the
// core chat loop. The SDK CLIENT is injected (real client from connection.js, or
// a mock in tests), as are the id minters — so this whole module is headless-
// testable by driving a fake sdk + pushing synthetic events.
import { createDataStore } from "./store.js";

// Coalesce streamed events into ~one repaint per frame (mirrors sync/sdk.js).
function createBatcher(flush, schedule) {
  let queue = [];
  let scheduled = false;
  return event => {
    queue.push(event);
    if (scheduled) return;
    scheduled = true;
    schedule(() => { const events = queue; queue = []; scheduled = false; flush(events); });
  };
}

let fallbackSeq = 0;
const defaultIds = {
  message: () => `msg_${Date.now()}_${(fallbackSeq++).toString().padStart(6, "0")}`,
  part: () => `prt_${Date.now()}_${(fallbackSeq++).toString().padStart(6, "0")}`,
};

export function createDataLayer(opts = {}) {
  const sdk = opts.sdk; // the SDK client (real or mock)
  const ids = opts.ids ?? defaultIds;
  const directory = opts.directory;
  const schedule = opts.schedule ?? (fn => setTimeout(fn, 16));
  const store = createDataStore();
  const synced = new Set();
  let stopEvents = null;

  const onBatch = events => store.applyBatch(events);
  const push = createBatcher(onBatch, schedule);

  // Start consuming the event stream: in-process (opts.events) or SSE.
  async function start() {
    if (opts.events) { stopEvents = await opts.events.subscribe(push); return; }
    if (!sdk?.global?.event) return; // a mock without a stream — tests push directly
    let aborted = false;
    stopEvents = () => { aborted = true; };
    (async () => {
      let attempt = 0;
      while (!aborted) {
        try {
          const events = await sdk.global.event({ sseMaxRetryAttempts: 0 });
          for await (const event of events.stream) { if (aborted) break; push(event); }
        } catch { /* reconnect */ }
        if (aborted) break;
        attempt++;
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 30000)));
      }
    })();
  }
  function stop() { try { stopEvents?.(); } catch { /* ignore */ } }

  // Initial fetch of providers / agents / commands / sessions.
  async function bootstrap() {
    const [providers, agents, commands, sessions] = await Promise.all([
      sdk.config.providers({}).then(r => r.data).catch(() => undefined),
      sdk.app.agents({}).then(r => r.data).catch(() => undefined),
      sdk.command.list({}).then(r => r.data).catch(() => undefined),
      sdk.session.list({ start: Date.now() - 30 * 86400000 }).then(r => r.data).catch(() => undefined), // 30-day window, like the live sync
    ]);
    store.setBootstrap({
      providers: providers?.providers ?? providers,
      agents, commands, sessions,
      status: "complete",
    });
  }

  // Lazily hydrate a session's full message+part history (once).
  async function syncSession(sessionID) {
    if (!sessionID || synced.has(sessionID)) return;
    synced.add(sessionID);
    const [session, messages] = await Promise.all([
      sdk.session.get({ sessionID }).then(r => r.data).catch(() => undefined),
      sdk.session.messages({ sessionID, limit: 100 }).then(r => r.data).catch(() => undefined),
    ]);
    const parts = {};
    for (const m of messages ?? []) if (m.info && m.parts) parts[m.info.id] = m.parts;
    store.hydrateSession(sessionID, { session, messages: (messages ?? []).map(m => m.info ?? m), parts });
  }

  const isKnownCommand = name => store.commands().some(c => c.name === name);

  // Submit a prompt/shell/command. Creates a session first if needed. Returns the
  // (possibly newly created) sessionID. Streamed results arrive via the event loop.
  async function submit(sessionID, text, { mode = "normal", agent, model, variant, parts = [] } = {}) {
    if (!sessionID) {
      const res = await sdk.session.create({ agent, model: model ? { providerID: model.providerID, id: model.modelID, variant } : undefined });
      if (res.error || !res.data?.id) throw new Error("session.create failed");
      sessionID = res.data.id;
    }
    const messageID = ids.message();
    if (mode === "shell") {
      await sdk.session.shell({ sessionID, agent, model: model && { providerID: model.providerID, modelID: model.modelID }, command: text });
    } else if (text.startsWith("/") && isKnownCommand(text.slice(1).split(/\s+/)[0])) {
      const firstLineEnd = text.indexOf("\n");
      const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
      const [command, ...rest] = firstLine.split(" ");
      const args = rest.join(" ") + (firstLineEnd === -1 ? "" : "\n" + text.slice(firstLineEnd + 1));
      await sdk.session.command({ sessionID, command: command.slice(1), arguments: args, agent, model: model && `${model.providerID}/${model.modelID}`, messageID, variant });
    } else {
      await sdk.session.prompt({ sessionID, messageID, agent, model, variant, parts: [{ id: ids.part(), type: "text", text }, ...parts] }).catch(() => {});
    }
    return sessionID;
  }

  const abort = sessionID => sdk.session.abort({ sessionID }).catch(() => {});
  const findFiles = query => sdk.find.files({ query, directory }).then(r => r.data ?? []).catch(() => []);

  return { store, start, stop, bootstrap, syncSession, submit, abort, findFiles, ids, get sdk() { return sdk; } };
}
