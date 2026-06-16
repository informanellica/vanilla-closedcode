/** @file The "plan_exit" tool: asks the user to approve a completed plan and, if approved, switches the session to the build agent. */
import { assetText } from "#util/asset.js";
import path from "path";
import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
import { Question } from "../question/index.js";
import { Session } from "#session/session.js";
import { MessageV2 } from "../session/message-v2.js";
import { Provider } from "#provider/provider.js";
import { InstanceState } from "#effect/instance-state.js";
import { MessageID, PartID } from "../session/schema.js";
const EXIT_DESCRIPTION = assetText("tool/plan-exit.txt");
/**
 * Find the model most recently used by a user message in the session, scanning
 * the message stream and returning the first user message that carries a model.
 * @param {string} sessionID - The session whose messages to scan.
 * @returns {Promise<*>} The model of the latest user message, or undefined if none.
 */
async function getLastModel(sessionID) {
  for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user" && item.info.model) return item.info.model;
  }
  return undefined;
}
/**
 * Parameter schema for the plan_exit tool: takes no parameters.
 * @type {Object}
 */
export const Parameters = Schema.Struct({});
/**
 * The "plan_exit" tool. Prompts the user to approve the completed plan; on "No"
 * it raises a RejectedError to stay in the plan agent, and on approval it
 * appends a synthetic user message switching the session to the build agent
 * (reusing the last user model, or the provider default) and instructing it to
 * execute the plan.
 * @type {Object}
 */
export const PlanExitTool = Tool.define("plan_exit", Effect.gen(function* () {
  const session = yield* Session.Service;
  const question = yield* Question.Service;
  const provider = yield* Provider.Service;
  return {
    description: EXIT_DESCRIPTION,
    parameters: Parameters,
    execute: (_params, ctx) => Effect.gen(function* () {
      const instance = yield* InstanceState.context;
      const info = yield* session.get(ctx.sessionID);
      const plan = path.relative(instance.worktree, Session.plan(info, instance));
      const answers = yield* question.ask({
        sessionID: ctx.sessionID,
        questions: [{
          question: `Plan at ${plan} is complete. Would you like to switch to the build agent and start implementing?`,
          header: "Build Agent",
          custom: false,
          options: [{
            label: "Yes",
            description: "Switch to build agent and start implementing the plan"
          }, {
            label: "No",
            description: "Stay with plan agent to continue refining the plan"
          }]
        }],
        tool: ctx.callID ? {
          messageID: ctx.messageID,
          callID: ctx.callID
        } : undefined
      });
      if (answers[0]?.[0] === "No") yield* new Question.RejectedError();
      const model = (yield* Effect.promise(() => getLastModel(ctx.sessionID))) ?? (yield* provider.defaultModel());
      const msg = {
        id: MessageID.ascending(),
        sessionID: ctx.sessionID,
        role: "user",
        time: {
          created: Date.now()
        },
        agent: "build",
        model
      };
      yield* session.updateMessage(msg);
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: ctx.sessionID,
        type: "text",
        text: `The plan at ${plan} has been approved, you can now edit files. Execute the plan`,
        synthetic: true
      });
      return {
        title: "Switching to build agent",
        output: "User approved switching to build agent. Wait for further instructions.",
        metadata: {}
      };
    }).pipe(Effect.orDie)
  };
}));