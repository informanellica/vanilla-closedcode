/**
 * @file Question service: lets the agent ask the user multiple-choice (or
 * custom-answer) questions, publishes ask/reply/reject events on the bus, and
 * resolves a pending Deferred when the user responds or dismisses the prompt.
 */
import { Deferred, Effect, Layer, Schema, Context } from "effect";
import { Bus } from "#bus/index.js";
import { BusEvent } from "#bus/bus-event.js";
import { InstanceState } from "#effect/instance-state.js";
import { SessionID, MessageID } from "#session/schema.js";
import { zod } from "#util/effect-zod.js";
import * as Log from "core/util/log";
import { withStatics } from "#util/schema.js";
import { QuestionID } from "./schema.js";
const log = Log.create({
  service: "question"
});

// Schemas

/**
 * A single selectable choice for a question, with a concise label and a longer
 * explanation.
 */
export class Option extends Schema.Class("QuestionOption")({
  label: Schema.String.annotate({
    description: "Display text (1-5 words, concise)"
  }),
  description: Schema.String.annotate({
    description: "Explanation of choice"
  })
}) {
  static zod = zod(this);
}
/**
 * Shared field definitions for question schemas: the question text, a short
 * header label, the available options, and whether multiple selection is allowed.
 * @type {Object}
 */
const base = {
  question: Schema.String.annotate({
    description: "Complete question"
  }),
  header: Schema.String.annotate({
    description: "Very short label (max 30 chars)"
  }),
  options: Schema.Array(Option).annotate({
    description: "Available choices"
  }),
  multiple: Schema.optional(Schema.Boolean).annotate({
    description: "Allow selecting multiple choices"
  })
};
/**
 * A fully-specified question as presented to the user: the base fields plus an
 * optional `custom` flag allowing a free-form typed answer.
 */
export class Info extends Schema.Class("QuestionInfo")({
  ...base,
  custom: Schema.optional(Schema.Boolean).annotate({
    description: "Allow typing a custom answer (default: true)"
  })
}) {
  static zod = zod(this);
}
/**
 * The question shape used when prompting (the base fields, without the `custom`
 * flag).
 */
export class Prompt extends Schema.Class("QuestionPrompt")(base) {
  static zod = zod(this);
}
/**
 * Links a question request back to the tool call that triggered it.
 */
export class Tool extends Schema.Class("QuestionTool")({
  messageID: MessageID,
  callID: Schema.String
}) {
  static zod = zod(this);
}
/**
 * A pending request to ask the user one or more questions within a session,
 * optionally associated with the originating tool call.
 */
export class Request extends Schema.Class("QuestionRequest")({
  id: QuestionID,
  sessionID: SessionID,
  questions: Schema.Array(Info).annotate({
    description: "Questions to ask"
  }),
  tool: Schema.optional(Tool)
}) {
  static zod = zod(this);
}
/**
 * A single question's answer: an array of selected option labels (or custom
 * strings).
 * @type {Object}
 */
export const Answer = Schema.Array(Schema.String).annotate({
  identifier: "QuestionAnswer"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * The user's reply to a request: one answer per question, in order.
 */
export class Reply extends Schema.Class("QuestionReply")({
  answers: Schema.Array(Answer).annotate({
    description: "User answers in order of questions (each answer is an array of selected labels)"
  })
}) {
  static zod = zod(this);
}
/**
 * Bus event payload emitted when a question request is answered.
 */
class Replied extends Schema.Class("QuestionReplied")({
  sessionID: SessionID,
  requestID: QuestionID,
  answers: Schema.Array(Answer)
}) {}
/**
 * Bus event payload emitted when a question request is dismissed/rejected.
 */
class Rejected extends Schema.Class("QuestionRejected")({
  sessionID: SessionID,
  requestID: QuestionID
}) {}
/**
 * Bus event definitions for the question lifecycle: Asked, Replied, Rejected.
 * @type {Object}
 */
export const Event = {
  Asked: BusEvent.define("question.asked", Request),
  Replied: BusEvent.define("question.replied", Replied),
  Rejected: BusEvent.define("question.rejected", Rejected)
};
/**
 * Tagged error raised when the user dismisses a question instead of answering.
 */
export class RejectedError extends Schema.TaggedErrorClass()("QuestionRejectedError", {}) {
  /**
   * Human-readable error message.
   * @returns {string} The dismissal message.
   */
  get message() {
    return "The user dismissed this question";
  }
}

// Service

/**
 * Effect Context tag for the Question service.
 */
export class Service extends Context.Service()("@closedcode/Question") {}
/**
 * Layer that builds the Question service: maintains per-instance pending
 * requests and exposes ask/reply/reject/list. Pending requests are failed with
 * RejectedError on finalization.
 * @type {Object}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const state = yield* InstanceState.make(Effect.fn("Question.state")(function* () {
    const state = {
      pending: new Map()
    };
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      for (const item of state.pending.values()) {
        yield* Deferred.fail(item.deferred, new RejectedError());
      }
      state.pending.clear();
    }));
    return state;
  }));
  /**
   * Ask the user a set of questions and wait for their reply.
   * Registers a pending Deferred, publishes the Asked event, and resolves when
   * the matching reply arrives (or fails with RejectedError if dismissed).
   * @param {Object} input - The request input: `sessionID`, `questions`, and optional `tool`.
   * @returns {Effect} An Effect resolving to the array of answers.
   */
  const ask = Effect.fn("Question.ask")(function* (input) {
    const pending = (yield* InstanceState.get(state)).pending;
    const id = QuestionID.ascending();
    log.info("asking", {
      id,
      questions: input.questions.length
    });
    const deferred = yield* Deferred.make();
    const info = Schema.decodeUnknownSync(Request)({
      id,
      sessionID: input.sessionID,
      questions: input.questions,
      tool: input.tool
    });
    pending.set(id, {
      info,
      deferred
    });
    yield* bus.publish(Event.Asked, info);
    return yield* Effect.ensuring(Deferred.await(deferred), Effect.sync(() => {
      pending.delete(id);
    }));
  });
  /**
   * Submit the user's answers for a pending question request.
   * No-ops (with a warning) if the request is unknown; otherwise removes it,
   * publishes the Replied event, and resolves the waiting Deferred.
   * @param {Object} input - Contains `requestID` and `answers` (array of answer arrays).
   * @returns {Effect} An Effect that completes the reply.
   */
  const reply = Effect.fn("Question.reply")(function* (input) {
    const pending = (yield* InstanceState.get(state)).pending;
    const existing = pending.get(input.requestID);
    if (!existing) {
      log.warn("reply for unknown request", {
        requestID: input.requestID
      });
      return;
    }
    pending.delete(input.requestID);
    log.info("replied", {
      requestID: input.requestID,
      answers: input.answers
    });
    yield* bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      answers: input.answers.map(a => [...a])
    });
    yield* Deferred.succeed(existing.deferred, input.answers);
  });
  /**
   * Dismiss a pending question request.
   * No-ops (with a warning) if unknown; otherwise removes it, publishes the
   * Rejected event, and fails the waiting Deferred with RejectedError.
   * @param {QuestionID} requestID - The id of the request to reject.
   * @returns {Effect} An Effect that completes the rejection.
   */
  const reject = Effect.fn("Question.reject")(function* (requestID) {
    const pending = (yield* InstanceState.get(state)).pending;
    const existing = pending.get(requestID);
    if (!existing) {
      log.warn("reject for unknown request", {
        requestID
      });
      return;
    }
    pending.delete(requestID);
    log.info("rejected", {
      requestID
    });
    yield* bus.publish(Event.Rejected, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id
    });
    yield* Deferred.fail(existing.deferred, new RejectedError());
  });
  /**
   * List all currently-pending question requests.
   * @returns {Effect} An Effect resolving to an array of Request info objects.
   */
  const list = Effect.fn("Question.list")(function* () {
    const pending = (yield* InstanceState.get(state)).pending;
    return Array.from(pending.values(), x => x.info);
  });
  return Service.of({
    ask,
    reply,
    reject,
    list
  });
}));
/**
 * The Question service layer with its Bus dependency provided.
 * @type {Object}
 */
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as Question from "./index.js";