// keybind.test.js — headless tests for the LEADER-chord resolver.
// Run with: node keybind.test.js   (no TTY, no jest required)

import {
  createKeybind,
  parseBinding,
  fromKey,
  matchCombo,
  defaultKeybinds,
} from "./keybind.js";

// --- tiny assert harness -------------------------------------------------
let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL: " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(
    actual === expected,
    `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
}

// A controllable clock so timeout behaviour is deterministic.
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

// Convenience: the configured leader is ctrl+x.
const CTRL_X = ["x", { ctrl: true }];

// --- parseBinding --------------------------------------------------------
{
  eq(parseBinding("none").length, 0, "parseBinding none -> empty");
  const cx = parseBinding("ctrl+x")[0];
  ok(cx.ctrl && cx.name === "x" && !cx.leader, "parseBinding ctrl+x");
  const lead = parseBinding("<leader>n")[0];
  ok(lead.leader && lead.name === "n", "parseBinding <leader>n -> leader chord");
  // Space-form "ctrl+x m" used in docs parses to a single combo with name 'm'.
  const spaced = parseBinding("ctrl+x m")[0];
  ok(
    spaced.ctrl && spaced.name === "m",
    "parseBinding 'ctrl+x m' collapses to ctrl + name m",
  );
  const multi = parseBinding("ctrl+c,<leader>q");
  eq(multi.length, 2, "parseBinding comma list length");
  ok(
    multi[0].name === "c" && multi[1].leader && multi[1].name === "q",
    "parseBinding comma list combos",
  );
}

// --- matchCombo / fromKey ------------------------------------------------
{
  const combo = parseBinding("ctrl+x")[0];
  ok(matchCombo(combo, fromKey("x", { ctrl: true })), "matchCombo ctrl+x");
  ok(!matchCombo(combo, fromKey("x", {})), "matchCombo rejects missing ctrl");
  const leaderCombo = parseBinding("<leader>n")[0];
  ok(
    matchCombo(leaderCombo, fromKey("n", {}, true)),
    "matchCombo leader chord when armed",
  );
  ok(
    !matchCombo(leaderCombo, fromKey("n", {}, false)),
    "matchCombo leader chord rejects unarmed",
  );
}

// --- default action map present -----------------------------------------
{
  const d = defaultKeybinds();
  for (const action of [
    "session_new",
    "session_list",
    "model_list",
    "model_cycle_recent",
    "agent_cycle",
    "agent_list",
    "variant_cycle",
    "help_show",
    "app_exit",
    "input_submit",
    "history_previous",
    "history_next",
    "sidebar_toggle",
  ]) {
    ok(action in d, `default map has ${action}`);
  }
  eq(d.leader, "ctrl+x", "default leader is ctrl+x");
}

// --- core: CTRL_X then 'm' resolves model_list --------------------------
{
  const clock = makeClock();
  const kb = createKeybind({ now: clock.now });

  eq(kb.isLeaderActive(), false, "starts idle");
  // Press leader (ctrl+x): consumed, arms leader, no action.
  eq(kb.resolve(...CTRL_X), null, "leader press returns null");
  eq(kb.isLeaderActive(), true, "leader armed after ctrl+x");
  // Next key 'm' resolves the <leader>m chord -> model_list.
  eq(kb.resolve("m", {}), "model_list", "ctrl+x m -> model_list");
  eq(kb.isLeaderActive(), false, "leader cleared after chord resolves");
}

// --- chord coverage for several actions ---------------------------------
{
  const press = (kb, seq) => {
    let last = null;
    for (const [name, data] of seq) last = kb.resolve(name, data ?? {});
    return last;
  };
  const mk = () => createKeybind({ now: makeClock().now });

  eq(press(mk(), [CTRL_X, ["n"]]), "session_new", "ctrl+x n -> session_new");
  eq(press(mk(), [CTRL_X, ["l"]]), "session_list", "ctrl+x l -> session_list");
  eq(press(mk(), [CTRL_X, ["a"]]), "agent_list", "ctrl+x a -> agent_list");
  eq(press(mk(), [CTRL_X, ["b"]]), "sidebar_toggle", "ctrl+x b -> sidebar_toggle");
  eq(press(mk(), [CTRL_X, ["q"]]), "app_exit", "ctrl+x q -> app_exit (chord)");
  eq(press(mk(), [CTRL_X, ["?"]]), "help_show", "ctrl+x ? -> help_show");
}

// --- plain (non-leader) bindings ----------------------------------------
{
  const kb = createKeybind({ now: makeClock().now });
  eq(kb.resolve("return", {}), "input_submit", "return -> input_submit");
  eq(kb.resolve("up", {}), "history_previous", "up -> history_previous");
  eq(kb.resolve("down", {}), "history_next", "down -> history_next");
  eq(kb.resolve("tab", {}), "agent_cycle", "tab -> agent_cycle");
  eq(kb.resolve("f2", {}), "model_cycle_recent", "f2 -> model_cycle_recent");
  eq(
    kb.resolve("t", { ctrl: true }),
    "variant_cycle",
    "ctrl+t -> variant_cycle",
  );
  // app_exit also bound to ctrl+c as a plain binding.
  eq(kb.resolve("c", { ctrl: true }), "app_exit", "ctrl+c -> app_exit (plain)");
  eq(kb.isLeaderActive(), false, "plain bindings never arm leader");
}

// --- leader-clear on a non-chord key ------------------------------------
{
  const kb = createKeybind({ now: makeClock().now });
  eq(kb.resolve(...CTRL_X), null, "arm leader");
  eq(kb.isLeaderActive(), true, "armed");
  // 'z' is not a defined chord -> resolves to null AND clears the leader.
  eq(kb.resolve("z", {}), null, "ctrl+x z -> null (no such chord)");
  eq(kb.isLeaderActive(), false, "leader cleared after non-chord key");
  // After clearing, 'm' alone is plain (no chord) -> null, leader stays idle.
  eq(kb.resolve("m", {}), null, "plain m with no chord -> null");
}

// --- a plain key while armed is consumed by the chord (not double-fired) -
{
  // 'return' is plain input_submit, but while armed it is the chord half.
  const kb = createKeybind({ now: makeClock().now });
  kb.resolve(...CTRL_X);
  // <leader>return is not bound -> null, and the plain input_submit must NOT
  // fire because the key was consumed as the chord half.
  eq(kb.resolve("return", {}), null, "armed return consumed (no submit)");
  eq(kb.isLeaderActive(), false, "leader cleared");
  // Now return fires plainly again.
  eq(kb.resolve("return", {}), "input_submit", "return fires plainly after");
}

// --- timeout clears the leader ------------------------------------------
{
  const clock = makeClock(1000);
  const kb = createKeybind({ now: clock.now, timeout: 2000 });
  eq(kb.resolve(...CTRL_X), null, "arm leader");
  eq(kb.isLeaderActive(), true, "armed at t=1000");
  clock.advance(2000); // reach the timeout boundary -> expired
  eq(kb.isLeaderActive(), false, "leader expired after timeout");
  // 'm' after timeout is a plain key (no chord) -> null, not model_list.
  eq(kb.resolve("m", {}), null, "m after timeout -> null (chord expired)");
}

// --- a fresh leader press after timeout still works ----------------------
{
  const clock = makeClock(0);
  const kb = createKeybind({ now: clock.now, timeout: 2000 });
  kb.resolve(...CTRL_X);
  clock.advance(5000); // long gone
  // Pressing the leader again must re-arm (not be swallowed as a stale chord).
  eq(kb.resolve(...CTRL_X), null, "re-arm leader after expiry");
  eq(kb.isLeaderActive(), true, "re-armed");
  eq(kb.resolve("n", {}), "session_new", "ctrl+x n works after re-arm");
}

// --- match() reflects current leader state without mutating -------------
{
  const kb = createKeybind({ now: makeClock().now });
  // Idle: 'return' matches input_submit; 'm' does not match model_list.
  ok(kb.match("input_submit", "return", {}), "match input_submit idle");
  ok(!kb.match("model_list", "m", {}), "no match model_list idle");
  // Arm and re-check: now 'm' matches model_list (leader chord), and match
  // must not consume the pending state.
  kb.resolve(...CTRL_X);
  ok(kb.isLeaderActive(), "armed before match");
  ok(kb.match("model_list", "m", {}), "match model_list while armed");
  ok(kb.isLeaderActive(), "match did not clear leader");
  ok(!kb.match("input_submit", "return", {}), "armed: return != plain submit");
}

// --- config override: disable + remap -----------------------------------
{
  const kb = createKeybind({
    now: makeClock().now,
    keybinds: {
      model_list: "none", // disabled
      session_new: "<leader>k", // remapped chord
      input_submit: "ctrl+m", // remapped plain
    },
  });
  kb.resolve(...CTRL_X);
  eq(kb.resolve("m", {}), null, "override: <leader>m disabled");
  // remapped chord
  const kb2 = createKeybind({
    now: makeClock().now,
    keybinds: { session_new: "<leader>k" },
  });
  kb2.resolve(...CTRL_X);
  eq(kb2.resolve("k", {}), "session_new", "override: <leader>k -> session_new");
  // remapped plain
  const kb3 = createKeybind({
    now: makeClock().now,
    keybinds: { input_submit: "ctrl+m" },
  });
  eq(kb3.resolve("m", { ctrl: true }), "input_submit", "override: ctrl+m submit");
}

// --- custom leader key ---------------------------------------------------
{
  const kb = createKeybind({
    now: makeClock().now,
    keybinds: { leader: "ctrl+b" },
  });
  // Old leader ctrl+x is no longer a leader (it is unbound -> null).
  eq(kb.resolve("x", { ctrl: true }), null, "ctrl+x not leader anymore");
  eq(kb.isLeaderActive(), false, "ctrl+x did not arm");
  // New leader ctrl+b arms.
  eq(kb.resolve("b", { ctrl: true }), null, "ctrl+b arms (custom leader)");
  eq(kb.isLeaderActive(), true, "armed via custom leader");
  eq(kb.resolve("n", {}), "session_new", "custom leader + n -> session_new");
}

// --- report --------------------------------------------------------------
console.log(`\nkeybind.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
