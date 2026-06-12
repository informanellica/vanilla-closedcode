// Node-run tests for the vanilla dialog families (Stage T3, stage 3). A minimal
// mock dialog manager mirrors the shell's open/close + onClose contract so the
// promise-returning helpers can be driven headlessly.
//   node src/cli/cmd/tui/vanilla/dialogs.test.mjs
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import * as Dialogs from "./dialogs.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(c, label) { eq(!!c, true, label); }
function rowText(buf, y, w) { let s = ""; for (let i = 0; i < w; i++) s += buf.get({ x: i, y }).char; return s.replace(/\s+$/, ""); }
const char = () => ({ isCharacter: true });

// Minimal dialog manager: a stack; close() pops and fires onClose (escape path).
function mockDialog() {
  const stack = [];
  return {
    open(spec) { stack.push(spec); },
    close() { const t = stack.pop(); t?.onClose?.(); },
    current: () => stack.at(-1),
    dispatch(name, data) { return stack.at(-1)?.widget.handleKey(name, data); },
    escape() { const t = stack.at(-1); if (t) { stack.pop(); t.onClose?.(); } }, // shell's onEscape => close
    render(w = 60, h = 16) {
      const buf = new tk.ScreenBuffer({ width: w, height: h }); buf.fill({ char: " " });
      const inner = makeRegion(buf, 2, 2, w - 4, h - 4);
      stack.at(-1)?.widget.draw(inner, { focusCursor: () => {} });
      let s = ""; for (let y = 0; y < h; y++) s += rowText(buf, y, w) + "\n"; return s;
    },
  };
}
const type = (d, str) => { for (const ch of str) d.dispatch(ch, char()); };

// --- select: filter + navigate + choose ----------------------------------
{
  const d = mockDialog();
  const p = Dialogs.select(d, { title: "Cmd", options: [
    { label: "New session", value: "new" }, { label: "Switch model", value: "models" }, { label: "Exit", value: "exit" },
  ] });
  ok(d.current(), "select dialog opened");
  ok(d.render().includes("New session"), "select renders options");
  type(d, "mod"); // filter -> "Switch model"
  ok(d.render().includes("Switch model"), "filter narrows to matching option");
  d.dispatch("ENTER");
  const chosen = await p;
  eq(chosen.value, "models", "select resolves the filtered+chosen option");
}

// --- select: escape resolves undefined ------------------------------------
{
  const d = mockDialog();
  const p = Dialogs.select(d, { options: ["a", "b"] });
  d.escape();
  eq(await p, undefined, "escape resolves select to undefined");
}

// --- confirm: Left toggles, Enter resolves --------------------------------
{
  const d = mockDialog();
  const p = Dialogs.confirm(d, { title: "Quit?", message: "Are you sure you want to exit?" });
  ok(d.render().includes("Are you sure"), "confirm renders the message");
  d.dispatch("LEFT"); // confirm -> cancel
  d.dispatch("ENTER");
  eq(await p, false, "confirm: toggled to cancel then Enter -> false");
}
{
  const d = mockDialog();
  const p = Dialogs.confirm(d, { message: "ok?" });
  d.dispatch("ENTER"); // default active = confirm
  eq(await p, true, "confirm: default Enter -> true");
}

// --- alert: Enter dismisses -----------------------------------------------
{
  const d = mockDialog();
  const p = Dialogs.alert(d, { title: "Done", message: "Updated successfully" });
  ok(d.render().includes("Updated successfully"), "alert renders the message");
  d.dispatch("ENTER");
  eq(await p, undefined, "alert resolves on Enter");
  eq(d.current(), undefined, "alert closed");
}

// --- prompt: type + Enter resolves the string -----------------------------
{
  const d = mockDialog();
  const p = Dialogs.prompt(d, { title: "Rename", placeholder: "new title" });
  type(d, "renamed");
  d.dispatch("ENTER");
  eq(await p, "renamed", "prompt resolves the entered text");
}

console.log(`tui vanilla dialogs tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
