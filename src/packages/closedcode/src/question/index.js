import { Deferred, Effect, Layer, Schema, Context } from "effect";
import { Bus } from "@/bus/index.js";
import { BusEvent } from "@/bus/bus-event.js";
import { InstanceState } from "@/effect/instance-state.js";
import { SessionID, MessageID } from "@/session/schema.js";
import { zod } from "@/util/effect-zod.js";
import * as Log from "core/util/log";
import { withStatics } from "@/util/schema.js";
import { QuestionID } from "./schema.js";
const log = Log.create({
  service: "question"
});

// Schemas

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
export class Info extends Schema.Class("QuestionInfo")({
  ...base,
  custom: Schema.optional(Schema.Boolean).annotate({
    description: "Allow typing a custom answer (default: true)"
  })
}) {
  static zod = zod(this);
}
export class Prompt extends Schema.Class("QuestionPrompt")(base) {
  static zod = zod(this);
}
export class Tool extends Schema.Class("QuestionTool")({
  messageID: MessageID,
  callID: Schema.String
}) {
  static zod = zod(this);
}
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
export const Answer = Schema.Array(Schema.String).annotate({
  identifier: "QuestionAnswer"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export class Reply extends Schema.Class("QuestionReply")({
  answers: Schema.Array(Answer).annotate({
    description: "User answers in order of questions (each answer is an array of selected labels)"
  })
}) {
  static zod = zod(this);
}
class Replied extends Schema.Class("QuestionReplied")({
  sessionID: SessionID,
  requestID: QuestionID,
  answers: Schema.Array(Answer)
}) {}
class Rejected extends Schema.Class("QuestionRejected")({
  sessionID: SessionID,
  requestID: QuestionID
}) {}
export const Event = {
  Asked: BusEvent.define("question.asked", Request),
  Replied: BusEvent.define("question.replied", Replied),
  Rejected: BusEvent.define("question.rejected", Rejected)
};
export class RejectedError extends Schema.TaggedErrorClass()("QuestionRejectedError", {}) {
  get message() {
    return "The user dismissed this question";
  }
}

// Service

export class Service extends Context.Service()("@closedcode/Question") {}
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
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as Question from "./index.js";