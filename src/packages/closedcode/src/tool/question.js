/** @file The "question" tool: asks the user one or more questions and reports their answers back to the model. */
import { assetText } from "#util/asset.js";
import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
import { Question } from "../question/index.js";
const DESCRIPTION = assetText("tool/question.txt");
/**
 * Parameter schema for the question tool: a mutable array of question prompts.
 * @type {Object}
 */
export const Parameters = Schema.Struct({
  questions: Schema.mutable(Schema.Array(Question.Prompt)).annotate({
    description: "Questions to ask"
  })
});
/**
 * The "question" tool. Presents the supplied questions to the user via the
 * Question service, then returns a human-readable summary of the answers (with
 * unanswered questions marked "Unanswered") plus the raw answers in metadata.
 * @type {Object}
 */
export const QuestionTool = Tool.define("question", Effect.gen(function* () {
  const question = yield* Question.Service;
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      const answers = yield* question.ask({
        sessionID: ctx.sessionID,
        questions: params.questions,
        tool: ctx.callID ? {
          messageID: ctx.messageID,
          callID: ctx.callID
        } : undefined
      });
      const formatted = params.questions.map((q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`).join(", ");
      return {
        title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
        output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
        metadata: {
          answers
        }
      };
    }).pipe(Effect.orDie)
  };
}));