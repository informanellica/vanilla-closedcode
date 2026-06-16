/** @file HTTP API handlers for the "tui" group: publish TUI events (prompt edits, command execution, toasts, session selection) onto the bus and bridge legacy control requests/responses. */
import { Bus } from "#bus/index.js";
import { TuiEvent } from "#cli/cmd/tui/event.js";
import * as Database from "#storage/db.js";
import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { nextTuiRequest, submitTuiResponse } from "../../../express/tui.js";
import { InstanceHttpApi } from "../api.js";
/**
 * Maps legacy TUI command names to their current canonical command ids.
 * @type {Object}
 */
const commandAliases = {
  session_new: "session.new",
  session_share: "session.share",
  session_interrupt: "session.interrupt",
  session_compact: "session.compact",
  messages_page_up: "session.page.up",
  messages_page_down: "session.page.down",
  messages_line_up: "session.line.up",
  messages_line_down: "session.line.down",
  messages_half_page_up: "session.half.page.up",
  messages_half_page_down: "session.half.page.down",
  messages_first: "session.first",
  messages_last: "session.last",
  agent_cycle: "agent.cycle"
};
/**
 * Builds the "tui" HTTP API handler group: endpoints that publish TUI control events onto the bus.
 * @type {Object}
 */
export const tuiHandlers = HttpApiBuilder.group(InstanceHttpApi, "tui", handlers => Effect.gen(function* () {
  const bus = yield* Bus.Service;
  /**
   * Publishes a CommandExecute event carrying the given command id onto the bus.
   * @param {string} command - The canonical TUI command id to execute.
   * @returns {Effect} Effect that publishes the command event.
   */
  const publishCommand = command => bus.publish(TuiEvent.CommandExecute, {
    command
  });
  /**
   * Appends text to the TUI prompt input.
   * @param {Object} ctx - Request context whose payload is the PromptAppend properties.
   * @returns {Effect} Effect resolving to true.
   */
  const appendPrompt = Effect.fn("TuiHttpApi.appendPrompt")(function* (ctx) {
    yield* bus.publish(TuiEvent.PromptAppend, ctx.payload);
    return true;
  });
  /**
   * Opens the TUI help dialog.
   * @returns {Effect} Effect resolving to true.
   */
  const openHelp = Effect.fn("TuiHttpApi.openHelp")(function* () {
    yield* publishCommand("help.show");
    return true;
  });
  /**
   * Opens the TUI session list.
   * @returns {Effect} Effect resolving to true.
   */
  const openSessions = Effect.fn("TuiHttpApi.openSessions")(function* () {
    yield* publishCommand("session.list");
    return true;
  });
  /**
   * Opens the TUI theme picker (currently maps to the session list command).
   * @returns {Effect} Effect resolving to true.
   */
  const openThemes = Effect.fn("TuiHttpApi.openThemes")(function* () {
    yield* publishCommand("session.list");
    return true;
  });
  /**
   * Opens the TUI model picker.
   * @returns {Effect} Effect resolving to true.
   */
  const openModels = Effect.fn("TuiHttpApi.openModels")(function* () {
    yield* publishCommand("model.list");
    return true;
  });
  /**
   * Submits the current TUI prompt.
   * @returns {Effect} Effect resolving to true.
   */
  const submitPrompt = Effect.fn("TuiHttpApi.submitPrompt")(function* () {
    yield* publishCommand("prompt.submit");
    return true;
  });
  /**
   * Clears the current TUI prompt.
   * @returns {Effect} Effect resolving to true.
   */
  const clearPrompt = Effect.fn("TuiHttpApi.clearPrompt")(function* () {
    yield* publishCommand("prompt.clear");
    return true;
  });
  /**
   * Executes a legacy TUI command by resolving its alias; unknown commands publish undefined.
   * @param {Object} ctx - Request context whose payload.command is the legacy command name.
   * @returns {Effect} Effect resolving to true.
   */
  const executeCommand = Effect.fn("TuiHttpApi.executeCommand")(function* (ctx) {
    // Legacy only publishes known aliases; unknown commands become undefined.
    yield* publishCommand(commandAliases[ctx.payload.command]);
    return true;
  });
  /**
   * Shows a toast notification in the TUI.
   * @param {Object} ctx - Request context whose payload is the ToastShow properties.
   * @returns {Effect} Effect resolving to true.
   */
  const showToast = Effect.fn("TuiHttpApi.showToast")(function* (ctx) {
    yield* bus.publish(TuiEvent.ToastShow, ctx.payload);
    return true;
  });
  /**
   * Generic publisher that routes a tagged payload to the matching TUI bus event
   * (PromptAppend, CommandExecute, ToastShow, or SessionSelect).
   * @param {Object} ctx - Request context whose payload has a type discriminator and properties.
   * @returns {Effect} Effect resolving to true.
   */
  const publish = Effect.fn("TuiHttpApi.publish")(function* (ctx) {
    if (ctx.payload.type === TuiEvent.PromptAppend.type) yield* bus.publish(TuiEvent.PromptAppend, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.CommandExecute.type) yield* bus.publish(TuiEvent.CommandExecute, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.ToastShow.type) yield* bus.publish(TuiEvent.ToastShow, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.SessionSelect.type) yield* bus.publish(TuiEvent.SessionSelect, ctx.payload.properties);
    return true;
  });
  /**
   * Selects a session in the TUI after validating the id prefix and confirming it exists in the database.
   * @param {Object} ctx - Request context whose payload.sessionID identifies the session to select.
   * @returns {Effect} Effect resolving to true, or failing with BadRequest (bad id) / NotFound (missing session).
   */
  const selectSession = Effect.fn("TuiHttpApi.selectSession")(function* (ctx) {
    if (!ctx.payload.sessionID.startsWith("ses")) return yield* new HttpApiError.BadRequest({});
    const row = yield* Effect.promise(() => Database.useAsync(async h => {
      const found = await h.models.Session.findOne({
        attributes: ["id"],
        where: { id: ctx.payload.sessionID },
        transaction: h.tx
      });
      return found == null ? undefined : found.get({ plain: true });
    }));
    if (!row) return yield* new HttpApiError.NotFound({});
    yield* bus.publish(TuiEvent.SessionSelect, ctx.payload);
    return true;
  });
  /**
   * Long-polls for the next pending TUI control request from the legacy bridge.
   * @returns {Effect} Effect resolving to the next control request once available.
   */
  const controlNext = Effect.fn("TuiHttpApi.controlNext")(function* () {
    return yield* Effect.promise(() => nextTuiRequest());
  });
  /**
   * Submits the response for an outstanding TUI control request back to the legacy bridge.
   * @param {Object} ctx - Request context whose payload is the control response.
   * @returns {Effect} Effect resolving to true.
   */
  const controlResponse = Effect.fn("TuiHttpApi.controlResponse")(function* (ctx) {
    submitTuiResponse(ctx.payload);
    return true;
  });
  return handlers.handle("appendPrompt", appendPrompt).handle("openHelp", openHelp).handle("openSessions", openSessions).handle("openThemes", openThemes).handle("openModels", openModels).handle("submitPrompt", submitPrompt).handle("clearPrompt", clearPrompt).handle("executeCommand", executeCommand).handle("showToast", showToast).handle("publish", publish).handle("selectSession", selectSession).handle("controlNext", controlNext).handle("controlResponse", controlResponse);
}));