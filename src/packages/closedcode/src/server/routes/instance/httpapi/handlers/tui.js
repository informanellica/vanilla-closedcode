import { Bus } from "#bus/index.js";
import { TuiEvent } from "#cli/cmd/tui/event.js";
import * as Database from "#storage/db.js";
import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { nextTuiRequest, submitTuiResponse } from "../../../express/tui.js";
import { InstanceHttpApi } from "../api.js";
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
export const tuiHandlers = HttpApiBuilder.group(InstanceHttpApi, "tui", handlers => Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const publishCommand = command => bus.publish(TuiEvent.CommandExecute, {
    command
  });
  const appendPrompt = Effect.fn("TuiHttpApi.appendPrompt")(function* (ctx) {
    yield* bus.publish(TuiEvent.PromptAppend, ctx.payload);
    return true;
  });
  const openHelp = Effect.fn("TuiHttpApi.openHelp")(function* () {
    yield* publishCommand("help.show");
    return true;
  });
  const openSessions = Effect.fn("TuiHttpApi.openSessions")(function* () {
    yield* publishCommand("session.list");
    return true;
  });
  const openThemes = Effect.fn("TuiHttpApi.openThemes")(function* () {
    yield* publishCommand("session.list");
    return true;
  });
  const openModels = Effect.fn("TuiHttpApi.openModels")(function* () {
    yield* publishCommand("model.list");
    return true;
  });
  const submitPrompt = Effect.fn("TuiHttpApi.submitPrompt")(function* () {
    yield* publishCommand("prompt.submit");
    return true;
  });
  const clearPrompt = Effect.fn("TuiHttpApi.clearPrompt")(function* () {
    yield* publishCommand("prompt.clear");
    return true;
  });
  const executeCommand = Effect.fn("TuiHttpApi.executeCommand")(function* (ctx) {
    // Legacy only publishes known aliases; unknown commands become undefined.
    yield* publishCommand(commandAliases[ctx.payload.command]);
    return true;
  });
  const showToast = Effect.fn("TuiHttpApi.showToast")(function* (ctx) {
    yield* bus.publish(TuiEvent.ToastShow, ctx.payload);
    return true;
  });
  const publish = Effect.fn("TuiHttpApi.publish")(function* (ctx) {
    if (ctx.payload.type === TuiEvent.PromptAppend.type) yield* bus.publish(TuiEvent.PromptAppend, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.CommandExecute.type) yield* bus.publish(TuiEvent.CommandExecute, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.ToastShow.type) yield* bus.publish(TuiEvent.ToastShow, ctx.payload.properties);
    if (ctx.payload.type === TuiEvent.SessionSelect.type) yield* bus.publish(TuiEvent.SessionSelect, ctx.payload.properties);
    return true;
  });
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
  const controlNext = Effect.fn("TuiHttpApi.controlNext")(function* () {
    return yield* Effect.promise(() => nextTuiRequest());
  });
  const controlResponse = Effect.fn("TuiHttpApi.controlResponse")(function* (ctx) {
    submitTuiResponse(ctx.payload);
    return true;
  });
  return handlers.handle("appendPrompt", appendPrompt).handle("openHelp", openHelp).handle("openSessions", openSessions).handle("openThemes", openThemes).handle("openModels", openModels).handle("submitPrompt", submitPrompt).handle("clearPrompt", clearPrompt).handle("executeCommand", executeCommand).handle("showToast", showToast).handle("publish", publish).handle("selectSession", selectSession).handle("controlNext", controlNext).handle("controlResponse", controlResponse);
}));