// Event-driven data store for the vanilla TUI (SDK-integration phase). This is
// the immediate-mode replacement for context/sync.js (a 435-line solid-js/store
// reducer). The crucial simplification: the vanilla shell redraws the WHOLE
// screen on any signal change, so we do NOT need solid-js/store's fine-grained
// per-path reactivity / reconcile identity preservation. Instead the reducer
// mutates plain JS collections in place and bumps ONE `rev` signal per event
// batch; every accessor reads rev() so the next paint sees fresh data.
//
// Scope: the v1 message+part model that routes/session renders (message.updated,
// message.part.updated/delta/removed, session.updated/deleted/status, permission
// + question). The SDK client is injected by the caller (real or mock), so this
// is headless-testable by feeding a synthetic event stream.
/** @file Event-driven data store for the vanilla TUI: mutates plain collections in place and bumps one `rev` signal per event batch so the whole-screen redraw sees fresh data. */
import { createSignal } from "../../runtime/reactivity.js";

const MESSAGE_CAP = 100;

/**
 * Insert-or-replace `item` into `arr`, keeping the array ascending by string id.
 * @param {Array} arr - Array of items each with an `id` string, sorted ascending.
 * @param {Object} item - Item to insert or replace (matched by `item.id`).
 * @returns {void}
 */
function upsert(arr, item) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === item.id) { arr[i] = item; return; }
    if (arr[i].id > item.id) { arr.splice(i, 0, item); return; }
  }
  arr.push(item);
}
/**
 * Remove the first item whose `id` equals `id` from `arr` (in place).
 * @param {Array} arr - Array of items each with an `id`.
 * @param {string} id - The id to remove.
 * @returns {boolean} True if an item was found and removed.
 */
function removeById(arr, id) {
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr.splice(i, 1);
  return i >= 0;
}

/**
 * Create the event-driven data store for the vanilla TUI.
 * Reduces an SDK event stream into plain JS collections and exposes rev-tracked
 * accessors plus derived selectors (timeline, status).
 * @returns {Object} The store: { rev, apply, applyBatch, setBootstrap, hydrateSession, sessions, messages, parts, providers, agents, commands, status, permissions, questions, todos, diff, timeline, sessionStatusText, _state }.
 */
export function createDataStore() {
  const [rev, setRev] = createSignal(0);
  const bump = () => setRev(v => v + 1);

  const s = {
    sessions: [],                 // Session[] ascending by id
    message: new Map(),           // sessionID -> Message[] ascending by id
    part: new Map(),              // messageID -> Part[] ascending by id
    sessionStatus: new Map(),     // sessionID -> status object
    permission: new Map(),        // sessionID -> request[]
    question: new Map(),          // sessionID -> request[]
    todo: new Map(),              // sessionID -> Todo[]
    diff: new Map(),              // sessionID -> diff (unified string or {files})
    providers: [],                // Provider[]
    agents: [],                   // Agent[]
    commands: [],                 // Command[]
    status: "loading",            // "loading" | "partial" | "complete"
  };

  /**
   * Apply a single SDK event to the store collections (no repaint bump).
   * @param {Object} event - The event { type, properties }.
   * @returns {boolean} True if the event type was recognized and handled.
   */
  function apply(event) {
    const p = event.properties ?? {};
    switch (event.type) {
      case "session.created": case "session.updated": upsert(s.sessions, p.info); break;
      case "session.deleted": removeById(s.sessions, p.info.id); break;
      case "session.status": s.sessionStatus.set(p.sessionID, p.status); break;
      case "message.updated": {
        const sid = p.info.sessionID;
        const arr = s.message.get(sid) ?? (s.message.set(sid, []), s.message.get(sid));
        upsert(arr, p.info);
        if (arr.length > MESSAGE_CAP) { const oldest = arr.shift(); s.part.delete(oldest.id); }
        break;
      }
      case "message.removed": { const arr = s.message.get(p.sessionID); if (arr) removeById(arr, p.messageID); break; }
      case "message.part.updated": {
        const mid = p.part.messageID;
        const arr = s.part.get(mid) ?? (s.part.set(mid, []), s.part.get(mid));
        upsert(arr, p.part);
        break;
      }
      case "message.part.delta": {
        const arr = s.part.get(p.messageID);
        if (!arr) break;
        const part = arr.find(x => x.id === p.partID);
        if (!part) break;
        part[p.field] = (part[p.field] ?? "") + p.delta; // streaming concat
        break;
      }
      case "message.part.removed": { const arr = s.part.get(p.messageID); if (arr) removeById(arr, p.partID); break; }
      case "permission.asked": { const a = s.permission.get(p.sessionID) ?? (s.permission.set(p.sessionID, []), s.permission.get(p.sessionID)); upsert(a, p); break; }
      case "permission.replied": { const a = s.permission.get(p.sessionID); if (a) removeById(a, p.requestID); break; }
      case "question.asked": { const a = s.question.get(p.sessionID) ?? (s.question.set(p.sessionID, []), s.question.get(p.sessionID)); upsert(a, p); break; }
      case "question.replied": case "question.rejected": { const a = s.question.get(p.sessionID); if (a) removeById(a, p.requestID); break; }
      case "todo.updated": s.todo.set(p.sessionID, p.todos ?? []); break;
      case "session.diff": s.diff.set(p.sessionID, p.diff); break;
      default: return false;
    }
    return true;
  }

  /**
   * Apply a batch of events as one repaint (mirrors sync.js's batched flush).
   * @param {Array} events - Events to apply, in order.
   * @returns {void}
   */
  function applyBatch(events) { for (const e of events) apply(e); bump(); }

  /**
   * Bootstrap / lazy-hydrate the top-level collections (called after SDK fetches).
   * @param {Object} [bootstrap] - Partial bootstrap data; only present keys are set.
   * @param {Array} [bootstrap.providers] - Provider list.
   * @param {Array} [bootstrap.agents] - Agent list.
   * @param {Array} [bootstrap.commands] - Command list.
   * @param {Array} [bootstrap.sessions] - Session list (copied and sorted ascending by id).
   * @param {string} [bootstrap.status] - Store status ("loading" | "partial" | "complete").
   * @returns {void}
   */
  function setBootstrap({ providers, agents, commands, sessions, status } = {}) {
    if (providers) s.providers = providers;
    if (agents) s.agents = agents;
    if (commands) s.commands = commands;
    if (sessions) s.sessions = [...sessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (status) s.status = status;
    bump();
  }
  /**
   * Hydrate one session's messages/parts/todos/diff from a full SDK fetch.
   * @param {string} sessionID - The session to hydrate.
   * @param {Object} [data] - Hydration data; only present keys are set.
   * @param {Object} [data.session] - The session info (upserted into the session list).
   * @param {Array} [data.messages] - Messages for the session (copied and sorted ascending by id).
   * @param {Object} [data.parts] - Map of messageID to its parts array (each sorted ascending by id).
   * @param {Array} [data.todo] - Todo list for the session.
   * @param {*} [data.diff] - Diff for the session (unified string or {files}).
   * @returns {void}
   */
  function hydrateSession(sessionID, { session, messages, parts, todo, diff } = {}) {
    if (session) upsert(s.sessions, session);
    if (messages) s.message.set(sessionID, [...messages].sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (parts) for (const [mid, arr] of Object.entries(parts)) s.part.set(mid, [...arr].sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (todo) s.todo.set(sessionID, todo);
    if (diff !== undefined) s.diff.set(sessionID, diff);
    bump();
  }

  /**
   * Derived: the chat timeline for a session, mapped to the vanilla timeline model.
   * Filters synthetic/ignored text, extracts tool diffs/output/file paths, etc.
   * @param {string} sessionID - The session to build the timeline for.
   * @returns {Array} Array of { role, parts } where each part is { type: "text" | "reasoning" | "tool" | "file", ... }.
   */
  function timeline(sessionID) {
    rev();
    const messages = s.message.get(sessionID) ?? [];
    return messages.map(m => {
      const parts = [];
      for (const part of s.part.get(m.id) ?? []) {
        if (part.type === "text") { if (part.synthetic || part.ignored) continue; parts.push({ type: "text", text: part.text ?? "" }); }
        else if (part.type === "reasoning") { if (part.text) parts.push({ type: "reasoning", text: part.text }); }
        else if (part.type === "tool") {
          const st = part.state ?? {};
          const tool = part.tool;
          let diff, output, path;
          if (["edit", "write", "apply_patch", "patch"].includes(tool)) {
            diff = st.metadata?.diff ?? st.metadata?.patch;
            if (!diff && st.input && (st.input.oldString != null || st.input.newString != null || st.input.content != null)) {
              diff = { old: st.input.oldString ?? "", new: st.input.newString ?? st.input.content ?? "" };
            }
            // A REAL file path for syntax-highlighting the diff — never st.title,
            // which for apply_patch is a multi-line summary ("Success. Updated…").
            // Prefer the tool input's file path; for a single-file apply_patch use
            // its one changed file; a multi-file apply_patch has no single language
            // so path stays undefined and the diff renders without highlighting.
            path = st.input?.filePath ?? st.input?.path ?? st.input?.filename;
            if (!path) {
              const files = st.metadata?.files;
              if (Array.isArray(files) && files.length === 1) {
                const f = files[0];
                path = typeof f === "string" ? f : (f?.path ?? f?.relativePath ?? f?.filePath ?? f?.filename);
              }
            }
            // edit/write set title to the edited file's path (single line) — a fine fallback.
            if (!path && (tool === "edit" || tool === "write") && typeof st.title === "string" && !st.title.includes("\n")) path = st.title;
          }
          if (typeof st.output === "string" && st.output) output = st.output;
          parts.push({ type: "tool", name: tool, title: st.title, status: st.status, diff, output, path });
        } else if (part.type === "file") { parts.push({ type: "file", filename: part.filename ?? part.source?.path }); }
      }
      return { role: m.role, parts };
    });
  }
  /**
   * Derived status string for a session (mirrors sync.session.status()).
   * @param {string} sessionID - The session to report status for.
   * @returns {string} "idle" or "working".
   */
  function sessionStatusText(sessionID) {
    rev();
    const session = s.sessions.find(x => x.id === sessionID);
    if (!session) return "idle";
    const messages = s.message.get(sessionID) ?? [];
    const last = messages.at(-1);
    if (!last) return "idle";
    if (last.role === "user") return "working";
    return last.time?.completed ? "idle" : "working";
  }

  return {
    rev, apply, applyBatch, setBootstrap, hydrateSession,
    sessions: () => (rev(), s.sessions),
    messages: sid => (rev(), s.message.get(sid) ?? []),
    parts: mid => (rev(), s.part.get(mid) ?? []),
    providers: () => (rev(), s.providers),
    agents: () => (rev(), s.agents),
    commands: () => (rev(), s.commands),
    status: () => (rev(), s.status),
    permissions: sid => (rev(), s.permission.get(sid) ?? []),
    questions: sid => (rev(), s.question.get(sid) ?? []),
    todos: sid => (rev(), s.todo.get(sid) ?? []),
    diff: sid => (rev(), s.diff.get(sid)),
    timeline, sessionStatusText,
    _state: s,
  };
}
