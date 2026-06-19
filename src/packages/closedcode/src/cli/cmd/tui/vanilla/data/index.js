/**
 * @file Vanilla data layer (SDK-integration phase): the store + the SDK-driven
 * actions and event loop, replacing the solid-js context stack (sync/sdk/local)
 * for the core chat loop. The SDK CLIENT is injected (real client from
 * connection.js, or a mock in tests), as are the id minters — so this whole module
 * is headless-testable by driving a fake sdk + pushing synthetic events.
 */
// Vanilla data layer (SDK-integration phase): the store + the SDK-driven actions
// and event loop, replacing the solid-js context stack (sync/sdk/local) for the
// core chat loop. The SDK CLIENT is injected (real client from connection.js, or
// a mock in tests), as are the id minters — so this whole module is headless-
// testable by driving a fake sdk + pushing synthetic events.
import { createDataStore } from "./store.js";

/**
 * Coalesce streamed events into ~one flush per scheduled frame (mirrors sync/sdk.js).
 * @param {Function} flush - Called with the queued events array on each scheduled frame.
 * @param {Function} schedule - Schedules a callback for the next frame (e.g. setTimeout).
 * @returns {Function} An `(event)` enqueue function that batches until the next flush.
 */
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

/**
 * Create the vanilla data layer: a reactive store plus SDK-driven actions and the
 * event stream loop for the core chat experience.
 * @param {Object} opts - `{sdk, ids, directory, events, schedule}`: the SDK client (real or mock), id minters, working directory, optional in-process event source, and a frame scheduler.
 * @returns {Object} `{store, start, stop, bootstrap, syncSession, submit, abort, findFiles, permissionReply, questionReply, questionReject, ids, sdk}`.
 */
export function createDataLayer(opts = {}) {
  const sdk = opts.sdk; // the SDK client (real or mock)
  const ids = opts.ids ?? defaultIds;
  const directory = opts.directory;
  const schedule = opts.schedule ?? (fn => setTimeout(fn, 16));
  const store = createDataStore();
  const synced = new Set();   // sessions whose history has been hydrated
  const inFlight = new Set(); // sessions whose hydration is currently in progress
  // tui.* are CONTROL events (toast/prompt/command side effects on the shell), not
  // store state. The shell registers a handler via setControlHandler(); until then
  // they are dropped (e.g. headless tests).
  let controlHandler = opts.onControlEvent ?? null;
  let stopEvents = null;

  const onBatch = events => store.applyBatch(events);
  const batch = createBatcher(onBatch, schedule);
  // Both event sources (the in-process worker relay and the SSE stream) deliver a
  // GlobalBus envelope `{ directory, payload }` whose `payload` is the inner bus
  // event `{ type, properties }`, but store.apply() reads `type`/`properties` off
  // the top level. Unwrap an envelope (and pass an already-inner event through
  // unchanged, e.g. tests that push directly), and drop "sync" frames, so live
  // message/status/permission/question events aren't dropped as `type === undefined`.
  const push = e => {
    const isEnvelope = e && e.type === undefined && e.payload !== undefined;
    // The global stream carries every directory's events, but this data layer is
    // scoped to one directory. Drop envelopes addressed to a DIFFERENT directory so
    // other projects' sessions/permissions/questions don't leak into this store.
    // (Envelopes with no directory, and already-inner events from tests, pass through.)
    if (isEnvelope && e.directory !== undefined && directory !== undefined && e.directory !== directory) return;
    const inner = isEnvelope ? e.payload : e;
    if (!inner || inner.type === "sync") return;
    // tui.* control events drive the shell (toast/prompt/command), not the store —
    // route them out instead of letting the pure reducer drop them.
    if (typeof inner.type === "string" && inner.type.startsWith("tui.")) { controlHandler?.(inner); return; }
    batch(inner);
  };

  /**
   * Start consuming the backend event stream — the in-process source (opts.events)
   * if present, otherwise an SSE loop with exponential-backoff reconnect.
   * @returns {Promise<void>}
   */
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
  /** Stop the event stream loop (idempotent; ignores teardown errors). @returns {void} */
  function stop() { try { stopEvents?.(); } catch { /* ignore */ } }

  /**
   * Initial fetch of providers, agents, commands, and recent sessions into the store.
   * @returns {Promise<void>}
   */
  // Initial fetch of providers / agents / commands / sessions.
  async function bootstrap() {
    const [providers, agents, commands, sessions] = await Promise.all([
      sdk.config.providers({}).then(r => r.data).catch(() => undefined),
      sdk.app.agents({}).then(r => r.data).catch(() => undefined),
      sdk.command.list({}).then(r => r.data).catch(() => undefined),
      sdk.session.list({}).then(r => r.data).catch(() => undefined), // newest sessions (time_updated DESC, server default limit) — no time cutoff so --continue still finds idle sessions
    ]);
    store.setBootstrap({
      providers: providers?.providers ?? providers,
      agents, commands, sessions,
      status: "complete",
    });
  }

  /**
   * Lazily hydrate a session's full message + part history (and todo/diff) into the
   * store, at most once per session id.
   * @param {string} sessionID - The session to hydrate.
   * @returns {Promise<void>}
   */
  // Lazily hydrate a session's full message+part history (once).
  async function syncSession(sessionID) {
    if (!sessionID || synced.has(sessionID) || inFlight.has(sessionID)) return;
    inFlight.add(sessionID); // gate concurrent calls so a retry doesn't double-fetch
    try {
      const opt = fn => (fn ? fn({ sessionID }).then(r => r.data).catch(() => undefined) : Promise.resolve(undefined));
      const [session, messages, todo, diff] = await Promise.all([
        sdk.session.get({ sessionID }).then(r => r.data).catch(() => undefined),
        sdk.session.messages({ sessionID, limit: 100 }).then(r => r.data).catch(() => undefined),
        opt(sdk.session.todo),
        opt(sdk.session.diff),
      ]);
      // Transient failure (neither the session nor its messages loaded): leave it
      // un-synced so a later navigation/submit retries instead of being permanently
      // stuck with an empty/partial timeline.
      if (session === undefined && messages === undefined) return;
      const parts = {};
      for (const m of messages ?? []) if (m.info && m.parts) parts[m.info.id] = m.parts;
      store.hydrateSession(sessionID, { session, messages: (messages ?? []).map(m => m.info ?? m), parts, todo, diff });
      synced.add(sessionID); // only mark synced after a successful hydrate
    } finally {
      inFlight.delete(sessionID);
    }
  }

  /** Whether `name` matches a known store command. @param {string} name @returns {boolean} */
  const isKnownCommand = name => store.commands().some(c => c.name === name);

  /**
   * Submit a prompt, shell command, or slash command, creating a session first if
   * needed. Streamed results arrive asynchronously via the event loop.
   * @param {string} sessionID - Target session id, or falsy to create a new session.
   * @param {string} text - The prompt text / shell command / slash command.
   * @param {Object} options - `{mode, agent, model, variant, parts}`: mode is "normal" or "shell"; model is `{providerID, modelID}`; parts are extra message parts.
   * @returns {Promise<string>} The (possibly newly created) session id.
   */
  // Submit a prompt/shell/command. Creates a session first if needed. Returns the
  // (possibly newly created) sessionID. Streamed results arrive via the event loop.
  async function submit(sessionID, text, { mode = "normal", agent, model, variant, parts = [] } = {}) {
    if (!sessionID) {
      const res = await sdk.session.create({ agent, model: model ? { providerID: model.providerID, id: model.modelID, variant } : undefined });
      if (res.error || !res.data?.id) throw new Error("session.create failed");
      sessionID = res.data.id;
    }
    const messageID = ids.message();
    // All three dispatch paths are non-blocking (like the desktop composer): we
    // return the sessionID as soon as the request is accepted so the caller can
    // navigate and the timeline streams in via the event loop. session.shell and
    // session.command run the full loop server-side before resolving, so they are
    // fire-and-forget (errors surface as error events on the stream); the prompt
    // path uses the async endpoint that returns immediately.
    if (mode === "shell") {
      sdk.session.shell({ sessionID, agent, model: model && { providerID: model.providerID, modelID: model.modelID }, command: text }).catch(() => {});
    } else if (text.startsWith("/") && isKnownCommand(text.slice(1).split(/\s+/)[0])) {
      const firstLineEnd = text.indexOf("\n");
      const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
      const [command, ...rest] = firstLine.split(" ");
      const args = rest.join(" ") + (firstLineEnd === -1 ? "" : "\n" + text.slice(firstLineEnd + 1));
      sdk.session.command({ sessionID, command: command.slice(1), arguments: args, agent, model: model && `${model.providerID}/${model.modelID}`, messageID, variant }).catch(() => {});
    } else {
      await sdk.session.promptAsync({ sessionID, messageID, agent, model, variant, parts: [{ id: ids.part(), type: "text", text }, ...parts] });
    }
    return sessionID;
  }

  /** Abort an in-flight session run. @param {string} sessionID @returns {Promise<*>} */
  const abort = sessionID => sdk.session.abort({ sessionID }).catch(() => {});
  /**
   * Fork a session into a new session (at its latest message point) and return
   * the new session id. Used by the `--fork` launch flag.
   * @param {string} sessionID - The session to fork.
   * @returns {Promise<string>} The new (forked) session id.
   */
  async function fork(sessionID) {
    const res = await sdk.session.fork({ sessionID });
    if (res.error || !res.data?.id) throw new Error("session.fork failed");
    return res.data.id;
  }
  /** Search project files for "@" mentions. @param {string} query @returns {Promise<Array>} matching file records (empty on error). */
  const findFiles = query => sdk.find.files({ query, directory }).then(r => r.data ?? []).catch(() => []);
  /** Reply to a permission request. @param {string} requestID @param {*} reply @param {Object} extra @returns {Promise<*>} */
  const permissionReply = (requestID, reply, extra = {}) => sdk.permission.reply({ requestID, reply, ...extra }).catch(() => {});
  /** Answer a pending question request. @param {string} requestID @param {*} answers @returns {Promise<*>} */
  const questionReply = (requestID, answers) => sdk.question.reply({ requestID, answers }).catch(() => {});
  /** Reject a pending question request. @param {string} requestID @returns {Promise<*>} */
  const questionReject = requestID => sdk.question.reject({ requestID }).catch(() => {});
  /** Register the handler for tui.* control events (toast/prompt/command). @param {Function} fn @returns {void} */
  const setControlHandler = fn => { controlHandler = fn; };

  return { store, start, stop, bootstrap, syncSession, submit, abort, fork, findFiles, permissionReply, questionReply, questionReject, setControlHandler, ids, get sdk() { return sdk; } };
}
