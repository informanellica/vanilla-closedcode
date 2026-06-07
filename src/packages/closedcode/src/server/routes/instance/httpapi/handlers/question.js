import { Question } from "@/question/index.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
export const questionHandlers = HttpApiBuilder.group(InstanceHttpApi, "question", handlers => Effect.gen(function* () {
  const svc = yield* Question.Service;
  const list = Effect.fn("QuestionHttpApi.list")(function* () {
    return yield* svc.list();
  });
  const reply = Effect.fn("QuestionHttpApi.reply")(function* (ctx) {
    yield* svc.reply({
      requestID: ctx.params.requestID,
      answers: ctx.payload.answers
    });
    return true;
  });
  const reject = Effect.fn("QuestionHttpApi.reject")(function* (ctx) {
    yield* svc.reject(ctx.params.requestID);
    return true;
  });
  return handlers.handle("list", list).handle("reply", reply).handle("reject", reject);
}));