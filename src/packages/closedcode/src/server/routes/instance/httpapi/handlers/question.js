/** @file HTTP API handlers for the "question" group: listing, replying to, and rejecting pending interactive questions. */
import { Question } from "#question/index.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Builds the "question" HTTP API handler group, wiring list/reply/reject endpoints to the Question service.
 * @type {Object}
 */
export const questionHandlers = HttpApiBuilder.group(InstanceHttpApi, "question", handlers => Effect.gen(function* () {
  const svc = yield* Question.Service;
  /**
   * Lists all currently pending questions.
   * @returns {Effect} Effect resolving to the list of pending questions.
   */
  const list = Effect.fn("QuestionHttpApi.list")(function* () {
    return yield* svc.list();
  });
  /**
   * Submits answers for a pending question identified by the path requestID.
   * @param {Object} ctx - Request context with params.requestID and payload.answers.
   * @returns {Effect} Effect resolving to true once the reply is recorded.
   */
  const reply = Effect.fn("QuestionHttpApi.reply")(function* (ctx) {
    yield* svc.reply({
      requestID: ctx.params.requestID,
      answers: ctx.payload.answers
    });
    return true;
  });
  /**
   * Rejects (dismisses without answering) a pending question identified by the path requestID.
   * @param {Object} ctx - Request context with params.requestID.
   * @returns {Effect} Effect resolving to true once the question is rejected.
   */
  const reject = Effect.fn("QuestionHttpApi.reject")(function* (ctx) {
    yield* svc.reject(ctx.params.requestID);
    return true;
  });
  return handlers.handle("list", list).handle("reply", reply).handle("reject", reject);
}));