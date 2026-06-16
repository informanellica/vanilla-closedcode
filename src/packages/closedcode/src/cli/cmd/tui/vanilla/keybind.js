/** @file keymap + LEADER-chord resolver for the vanilla TUI: a pure, dependency-free re-implementation of the solid/opentui keybinding context. */
// keybind.js — keymap + LEADER-chord resolver for the vanilla TUI.
//
// This module is a pure, synchronous re-implementation of the keybinding
// behaviour that the solid/opentui context (../context/keybind.js) provides,
// but with zero framework dependencies so it can run headless and be unit
// tested with a plain `node <file>`.
//
// Concepts
// --------
// A *binding string* (as stored in tui.json `keybinds`, e.g. "ctrl+x m" or
// "<leader>n,ctrl+p") is parsed into a list of *combos*.  A combo is a plain
// object: { ctrl, meta, shift, super, leader, name }.  `name` is the final key
// (lowercased), the booleans are modifier flags, and `leader` means the combo
// must be typed *after* the leader key (i.e. it is a chord).
//
// A *key event* arriving from the terminal is normalised the same way via
// `fromKey(name, data)` so it can be compared with a combo using `matchCombo`.
//
// The resolver owns a tiny state machine:
//   idle  --(leader key)-->  pending  --(any key)-->  idle
// While `pending`, the next key is interpreted as the trailing half of a chord
// (leader === true).  A timeout (default 2000ms) or a key that does not form a
// known chord clears the pending state.

// ---------------------------------------------------------------------------
// Combo parsing / matching (inlined from src/util/keybind.js, dependency-free)
// ---------------------------------------------------------------------------

/**
 * Parse a binding string into a list of combo descriptors.
 * "none" yields an empty list (the binding is disabled).
 * Multiple combos are comma separated; "<leader>" is shorthand for "leader+".
 * @param {string} key
 * @returns {Array<{ctrl:boolean,meta:boolean,shift:boolean,super:boolean,leader:boolean,name:string}>}
 */
export function parseBinding(key) {
  if (key == null || key === "none") return [];
  return String(key)
    .split(",")
    .map((combo) => combo.trim())
    .filter(Boolean)
    .map((combo) => {
      // Support both "<leader>x" and the space-form "ctrl+x m" used in docs.
      // A leading "ctrl+x" segment that equals the configured leader is handled
      // by the resolver itself, but the canonical authoring form is "<leader>".
      const normalized = combo.replace(/<leader>/g, "leader+");
      const parts = normalized.toLowerCase().split(/[+ ]/).filter(Boolean);
      const info = {
        ctrl: false,
        meta: false,
        shift: false,
        super: false,
        leader: false,
        name: "",
      };
      for (const part of parts) {
        switch (part) {
          case "ctrl":
            info.ctrl = true;
            break;
          case "alt":
          case "meta":
          case "option":
            info.meta = true;
            break;
          case "super":
          case "cmd":
            info.super = true;
            break;
          case "shift":
            info.shift = true;
            break;
          case "leader":
            info.leader = true;
            break;
          case "esc":
            info.name = "escape";
            break;
          default:
            info.name = part;
            break;
        }
      }
      return info;
    });
}

/**
 * Normalise a raw key event into a combo descriptor.
 * @param {string} name      the key name (e.g. "x", "return", " " -> "space")
 * @param {object} [data]    modifier flags { ctrl, meta, shift, super }
 * @param {boolean} [leader] whether the leader chord is currently armed
 */
export function fromKey(name, data = {}, leader = false) {
  return {
    name: name === " " ? "space" : (name ?? "").toLowerCase(),
    ctrl: !!data.ctrl,
    meta: !!data.meta,
    shift: !!data.shift,
    super: !!data.super,
    leader,
  };
}

/**
 * True when a parsed combo equals a normalised key event.
 * @param {object} combo a descriptor from {@link parseBinding}
 * @param {object} event a descriptor from {@link fromKey}
 */
export function matchCombo(combo, event) {
  if (!combo || !event) return false;
  return (
    combo.name === event.name &&
    !!combo.ctrl === !!event.ctrl &&
    !!combo.meta === !!event.meta &&
    !!combo.shift === !!event.shift &&
    !!combo.super === !!event.super &&
    !!combo.leader === !!event.leader
  );
}

// ---------------------------------------------------------------------------
// Default action map (mirrors src/config/keybinds.js KeybindsSchema defaults)
// ---------------------------------------------------------------------------

/**
 * The default action -> binding map.  Returned as a fresh object on each call
 * so callers cannot mutate the shared template.
 */
export function defaultKeybinds() {
  return {
    leader: "ctrl+x",
    app_exit: "ctrl+c,ctrl+d,<leader>q",
    editor_open: "<leader>e",
    theme_list: "<leader>t",
    sidebar_toggle: "<leader>b",
    diff_view_toggle: "<leader>d", // vanilla TUI: cycle tool diffs unified <-> split
    status_view: "<leader>s",
    session_export: "<leader>x",
    session_new: "<leader>n",
    session_list: "<leader>l",
    session_timeline: "<leader>g",
    session_rename: "ctrl+r",
    session_delete: "ctrl+d",
    session_compact: "<leader>c",
    session_interrupt: "escape",
    help_show: "<leader>?",
    messages_copy: "<leader>y",
    messages_undo: "<leader>u",
    messages_redo: "<leader>r",
    messages_first: "ctrl+g,home",
    messages_last: "end",
    model_list: "<leader>m",
    model_cycle_recent: "f2",
    model_cycle_recent_reverse: "shift+f2",
    command_list: "ctrl+p",
    agent_list: "<leader>a",
    agent_cycle: "tab",
    agent_cycle_reverse: "shift+tab",
    variant_cycle: "ctrl+t",
    variant_list: "none",
    input_submit: "return",
    input_newline: "shift+return,ctrl+j",
    input_clear: "ctrl+c",
    history_previous: "up",
    history_next: "down",
  };
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Create a keybinding resolver.
 *
 * @param {object} [config]
 * @param {Record<string,string>} [config.keybinds] action -> binding overrides
 *   merged over {@link defaultKeybinds}.  A binding of "none" disables it.
 * @param {() => number} [config.now] monotonic clock in ms (defaults Date.now);
 *   injectable for deterministic tests.
 * @param {number} [config.timeout] leader chord timeout in ms (default 2000).
 * @returns {{
 *   resolve: (name:string, data?:object) => string|null,
 *   match: (action:string, name:string, data?:object) => boolean,
 *   isLeaderActive: () => boolean,
 *   clearLeader: () => void,
 *   keybinds: Record<string,string>,
 *   bindings: (action:string) => Array,
 * }}
 */
export function createKeybind(config = {}) {
  const now = typeof config.now === "function" ? config.now : Date.now;
  const timeoutMs =
    typeof config.timeout === "number" ? config.timeout : DEFAULT_TIMEOUT_MS;

  // Merge overrides on top of the defaults.  Explicit undefined entries are
  // ignored so a partial config does not wipe a default binding.
  const keybinds = { ...defaultKeybinds() };
  if (config.keybinds) {
    for (const [action, value] of Object.entries(config.keybinds)) {
      if (value !== undefined) keybinds[action] = value;
    }
  }

  // Pre-parse every binding once; bindings never change after construction.
  /** @type {Record<string, ReturnType<typeof parseBinding>>} */
  const parsed = {};
  for (const [action, value] of Object.entries(keybinds)) {
    parsed[action] = parseBinding(value);
  }

  const leaderCombos = parsed.leader ?? [];

  // Leader state machine.
  let pending = false;
  let pendingAt = 0;

  function leaderExpired() {
    return pending && now() - pendingAt >= timeoutMs;
  }

  function clearLeader() {
    pending = false;
    pendingAt = 0;
  }

  function armLeader() {
    pending = true;
    pendingAt = now();
  }

  /** Does this key event match the configured leader key (no leader prefix)? */
  function isLeaderKey(event) {
    return leaderCombos.some((c) => matchCombo({ ...c, leader: false }, event));
  }

  /**
   * Find the action whose binding list contains a combo matching `event`.
   * Returns the action name or null.  Skips the synthetic "leader" entry.
   */
  function lookup(event) {
    for (const action of Object.keys(parsed)) {
      if (action === "leader") continue;
      const combos = parsed[action];
      for (const combo of combos) {
        if (matchCombo(combo, event)) return action;
      }
    }
    return null;
  }

  /**
   * Resolve a key event to an action name, managing leader-chord state.
   *
   * Behaviour:
   *  - If the leader chord has timed out, it is cleared before processing so the
   *    incoming key is treated as fresh.
   *  - When idle and the key is the leader key, the chord is armed and `null` is
   *    returned (the key is consumed, no action fires yet).
   *  - When armed, the key resolves as a "leader+key" chord; pending state is
   *    always cleared afterwards (whether or not a chord matched).  A non-chord
   *    key therefore both clears the leader and may still resolve as a plain
   *    binding is NOT attempted here — the chord half is consumed by the leader.
   *  - When idle and not the leader key, a plain binding lookup is performed.
   *
   * @param {string} name key name
   * @param {object} [data] modifier flags { ctrl, meta, shift, super }
   * @returns {string|null} resolved action or null
   */
  function resolve(name, data = {}) {
    // Expired chord: forget it so this key starts a clean cycle.
    if (leaderExpired()) clearLeader();

    if (pending) {
      // The next key after the leader is interpreted as a chord (leader=true).
      const event = fromKey(name, data, true);
      const action = lookup(event);
      // The chord half is consumed regardless of whether it matched; pressing
      // a non-chord key clears the leader (and fires nothing).
      clearLeader();
      return action;
    }

    // Idle: is this the leader key itself?
    const plainEvent = fromKey(name, data, false);
    if (isLeaderKey(plainEvent)) {
      armLeader();
      return null;
    }

    // Idle plain binding.
    return lookup(plainEvent);
  }

  /**
   * True when `event` (interpreted with the CURRENT leader state) is bound to
   * `action`.  Does not mutate state — useful for "is this key X?" checks.
   * @param {string} action
   * @param {string} name
   * @param {object} [data]
   */
  function match(action, name, data = {}) {
    const combos = parsed[action];
    if (!combos || !combos.length) return false;
    const armed = pending && !leaderExpired();
    const event = fromKey(name, data, armed);
    return combos.some((c) => matchCombo(c, event));
  }

  return {
    resolve,
    match,
    isLeaderActive: () => pending && !leaderExpired(),
    clearLeader,
    keybinds,
    bindings: (action) => parsed[action] ?? [],
  };
}

export default createKeybind;
