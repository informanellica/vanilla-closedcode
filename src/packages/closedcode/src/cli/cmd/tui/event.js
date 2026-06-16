/** @file Bus event definitions emitted/consumed by the TUI (prompt edits, commands, toasts, session navigation). */
import { BusEvent } from "#bus/bus-event.js";
import { SessionID } from "#session/schema.js";
import { PositiveInt } from "#util/schema.js";
import { Effect, Schema } from "effect";
/** Default lifetime, in milliseconds, of a toast that does not specify a duration. */
const DEFAULT_TOAST_DURATION = 5000;
/**
 * The set of bus events the TUI publishes/subscribes to, keyed by purpose.
 * Each entry is a BusEvent created via BusEvent.define(name, schema):
 * - PromptAppend: append text to the prompt input ({ text }).
 * - CommandExecute: run a named TUI command (session navigation, prompt actions, etc.).
 * - ToastShow: display a transient notification ({ title?, message, variant, duration }).
 * - SessionSelect: navigate to a session by id ({ sessionID }).
 * @type {Object}
 */
export const TuiEvent = {
  PromptAppend: BusEvent.define("tui.prompt.append", Schema.Struct({
    text: Schema.String
  })),
  CommandExecute: BusEvent.define("tui.command.execute", Schema.Struct({
    command: Schema.Union([Schema.Literals(["session.list", "session.new", "session.share", "session.interrupt", "session.compact", "session.page.up", "session.page.down", "session.line.up", "session.line.down", "session.half.page.up", "session.half.page.down", "session.first", "session.last", "prompt.clear", "prompt.submit", "agent.cycle"]), Schema.String])
  })),
  ToastShow: BusEvent.define("tui.toast.show", Schema.Struct({
    title: Schema.optional(Schema.String),
    message: Schema.String,
    variant: Schema.Literals(["info", "success", "warning", "error"]),
    duration: PositiveInt.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_TOAST_DURATION))).annotate({
      description: "Duration in milliseconds"
    })
  })),
  SessionSelect: BusEvent.define("tui.session.select", Schema.Struct({
    sessionID: SessionID.annotate({
      description: "Session ID to navigate to"
    })
  }))
};