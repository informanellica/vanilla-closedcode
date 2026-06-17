/**
 * EventV2 definitions for the v2 session stream (agent/model switches, prompts, shell, steps, text, reasoning, tool calls, retries, compaction).
 * @module closedcode/v2/session-event
 */
import { SessionID } from "#session/schema.js";
import { NonNegativeInt } from "#util/schema.js";
import { EventV2 } from "./event.js";
import { FileAttachment, Prompt } from "./session-prompt.js";
import { Schema } from "effect";
export { FileAttachment };
import { ToolOutput } from "./tool-output.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { V2Schema } from "./schema.js";

/**
 * Schema for a text span reference: a [start, end) range plus the referenced text.
 * @type {Object}
 */
export const Source = Schema.Struct({
  start: NonNegativeInt,
  end: NonNegativeInt,
  text: Schema.String
}).annotate({
  identifier: "session.next.event.source"
});

/**
 * Common fields shared by every session event: emission timestamp and owning session id.
 * @type {Object}
 */
const Base = {
  timestamp: V2Schema.DateTimeUtcFromMillis,
  sessionID: SessionID
};

/** Event: the active agent for the session was switched. @type {Object} */
export const AgentSwitched = EventV2.define({
  type: "session.next.agent.switched",
  aggregate: "sessionID",
  version: 1,
  schema: {
    ...Base,
    agent: Schema.String
  }
});
/** Event: the active model (and provider/variant) for the session was switched. @type {Object} */
export const ModelSwitched = EventV2.define({
  type: "session.next.model.switched",
  aggregate: "sessionID",
  version: 1,
  schema: {
    ...Base,
    id: ModelID,
    providerID: ProviderID,
    variant: Schema.String.pipe(Schema.optional)
  }
});
/** Event: the user submitted a prompt to the session. @type {Object} */
export const Prompted = EventV2.define({
  type: "session.next.prompted",
  aggregate: "sessionID",
  version: 1,
  schema: {
    ...Base,
    prompt: Prompt
  }
});
/** Event: a synthetic (system-injected) text message was added to the session. @type {Object} */
export const Synthetic = EventV2.define({
  type: "session.next.synthetic",
  aggregate: "sessionID",
  schema: {
    ...Base,
    text: Schema.String
  }
});
/** Namespace of shell command lifecycle events (Started / Ended). @type {Object} */
export let Shell;
(function (_Shell) {
  /** Event: a shell command started running. @type {Object} */
  const Started = _Shell.Started = EventV2.define({
    type: "session.next.shell.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      command: Schema.String
    }
  });
  /** Event: a shell command finished, carrying its captured output. @type {Object} */
  const Ended = _Shell.Ended = EventV2.define({
    type: "session.next.shell.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      output: Schema.String
    }
  });
})(Shell || (Shell = {}));
/** Namespace of assistant step lifecycle events (Started / Ended). @type {Object} */
export let Step;
(function (_Step) {
  /** Event: an assistant step started, recording the agent, model and optional snapshot. @type {Object} */
  const Started = _Step.Started = EventV2.define({
    type: "session.next.step.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      agent: Schema.String,
      model: Schema.Struct({
        id: Schema.String,
        providerID: Schema.String,
        variant: Schema.String.pipe(Schema.optional)
      }),
      snapshot: Schema.String.pipe(Schema.optional)
    }
  });
  /** Event: an assistant step ended, recording finish reason, cost, token usage and optional snapshot. @type {Object} */
  const Ended = _Step.Ended = EventV2.define({
    type: "session.next.step.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      finish: Schema.String,
      cost: Schema.Finite,
      tokens: Schema.Struct({
        input: NonNegativeInt,
        output: NonNegativeInt,
        reasoning: NonNegativeInt,
        cache: Schema.Struct({
          read: NonNegativeInt,
          write: NonNegativeInt
        })
      }),
      snapshot: Schema.String.pipe(Schema.optional)
    }
  });
})(Step || (Step = {}));
/** Namespace of assistant text streaming events (Started / Delta / Ended). @type {Object} */
export let Text;
(function (_Text) {
  /** Event: assistant text output started. @type {Object} */
  const Started = _Text.Started = EventV2.define({
    type: "session.next.text.started",
    aggregate: "sessionID",
    schema: {
      ...Base
    }
  });
  /** Event: an incremental chunk of assistant text. @type {Object} */
  const Delta = _Text.Delta = EventV2.define({
    type: "session.next.text.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      delta: Schema.String
    }
  });
  /** Event: assistant text output finished, carrying the final text. @type {Object} */
  const Ended = _Text.Ended = EventV2.define({
    type: "session.next.text.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      text: Schema.String
    }
  });
})(Text || (Text = {}));
/** Namespace of assistant reasoning streaming events (Started / Delta / Ended), keyed by reasoningID. @type {Object} */
export let Reasoning;
(function (_Reasoning) {
  /** Event: a reasoning block started. @type {Object} */
  const Started = _Reasoning.Started = EventV2.define({
    type: "session.next.reasoning.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reasoningID: Schema.String
    }
  });
  /** Event: an incremental chunk of reasoning text for a given reasoningID. @type {Object} */
  const Delta = _Reasoning.Delta = EventV2.define({
    type: "session.next.reasoning.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reasoningID: Schema.String,
      delta: Schema.String
    }
  });
  /** Event: a reasoning block finished, carrying the final reasoning text. @type {Object} */
  const Ended = _Reasoning.Ended = EventV2.define({
    type: "session.next.reasoning.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reasoningID: Schema.String,
      text: Schema.String
    }
  });
})(Reasoning || (Reasoning = {}));
/** Namespace of tool-call events: streamed input (Input.Started/Delta/Ended) plus Called/Progress/Success/Error, all keyed by callID. @type {Object} */
export let Tool;
(function (_Tool) {
  /** Namespace of tool input streaming events (Started / Delta / Ended). @type {Object} */
  let Input;
  (function (_Input) {
    /** Event: streaming of a tool's input arguments started, naming the tool. @type {Object} */
    const Started = _Input.Started = EventV2.define({
      type: "session.next.tool.input.started",
      aggregate: "sessionID",
      schema: {
        ...Base,
        callID: Schema.String,
        name: Schema.String
      }
    });
    /** Event: an incremental chunk of a tool's serialized input arguments. @type {Object} */
    const Delta = _Input.Delta = EventV2.define({
      type: "session.next.tool.input.delta",
      aggregate: "sessionID",
      schema: {
        ...Base,
        callID: Schema.String,
        delta: Schema.String
      }
    });
    /** Event: streaming of a tool's input arguments finished, carrying the full serialized text. @type {Object} */
    const Ended = _Input.Ended = EventV2.define({
      type: "session.next.tool.input.ended",
      aggregate: "sessionID",
      schema: {
        ...Base,
        callID: Schema.String,
        text: Schema.String
      }
    });
  })(Input || (Input = _Tool.Input || (_Tool.Input = {})));
  /** Event: a tool was invoked with parsed input, plus provider execution metadata. @type {Object} */
  const Called = _Tool.Called = EventV2.define({
    type: "session.next.tool.called",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      tool: Schema.String,
      input: Schema.Record(Schema.String, Schema.Unknown),
      provider: Schema.Struct({
        executed: Schema.Boolean,
        metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional)
      })
    }
  });
  /** Event: interim progress from a running tool, carrying partial structured/content output. @type {Object} */
  const Progress = _Tool.Progress = EventV2.define({
    type: "session.next.tool.progress",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      structured: ToolOutput.Structured,
      content: Schema.Array(ToolOutput.Content)
    }
  });
  /** Event: a tool completed successfully, carrying final structured/content output and provider metadata. @type {Object} */
  const Success = _Tool.Success = EventV2.define({
    type: "session.next.tool.success",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      structured: ToolOutput.Structured,
      content: Schema.Array(ToolOutput.Content),
      provider: Schema.Struct({
        executed: Schema.Boolean,
        metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional)
      })
    }
  });
  /** Event: a tool failed, carrying the error type/message and provider metadata. @type {Object} */
  const Error = _Tool.Error = EventV2.define({
    type: "session.next.tool.error",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      error: Schema.Struct({
        type: Schema.String,
        message: Schema.String
      }),
      provider: Schema.Struct({
        executed: Schema.Boolean,
        metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional)
      })
    }
  });
})(Tool || (Tool = {}));
/**
 * Schema describing a retryable provider error (message, optional HTTP status/headers/body and metadata).
 * @type {Object}
 */
export const RetryError = Schema.Struct({
  message: Schema.String,
  statusCode: NonNegativeInt.pipe(Schema.optional),
  isRetryable: Schema.Boolean,
  responseHeaders: Schema.Record(Schema.String, Schema.String).pipe(Schema.optional),
  responseBody: Schema.String.pipe(Schema.optional),
  metadata: Schema.Record(Schema.String, Schema.String).pipe(Schema.optional)
}).annotate({
  identifier: "session.next.retry_error"
});
/** Event: a step was retried after a recoverable error, recording the attempt number and error. @type {Object} */
export const Retried = EventV2.define({
  type: "session.next.retried",
  aggregate: "sessionID",
  schema: {
    ...Base,
    attempt: NonNegativeInt,
    error: RetryError
  }
});
/** Namespace of history compaction events (Started / Delta / Ended). @type {Object} */
export let Compaction;
(function (_Compaction) {
  /** Event: a compaction pass started, recording whether it was auto or manual. @type {Object} */
  const Started = _Compaction.Started = EventV2.define({
    type: "session.next.compaction.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reason: Schema.Union([Schema.Literal("auto"), Schema.Literal("manual")])
    }
  });
  /** Event: an incremental chunk of the compaction summary text. @type {Object} */
  const Delta = _Compaction.Delta = EventV2.define({
    type: "session.next.compaction.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      text: Schema.String
    }
  });
  /** Event: a compaction pass finished, carrying the final summary text and optional include directive. @type {Object} */
  const Ended = _Compaction.Ended = EventV2.define({
    type: "session.next.compaction.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      text: Schema.String,
      include: Schema.String.pipe(Schema.optional)
    }
  });
})(Compaction || (Compaction = {}));
/**
 * Tagged union of every session event, discriminated on the `type` field; exposes a `.match(event, handlers)` dispatcher.
 * @type {Object}
 */
export const All = Schema.Union([AgentSwitched, ModelSwitched, Prompted, Synthetic, Shell.Started, Shell.Ended, Step.Started, Step.Ended, Text.Started, Text.Delta, Text.Ended, Tool.Input.Started, Tool.Input.Delta, Tool.Input.Ended, Tool.Called, Tool.Progress, Tool.Success, Tool.Error, Reasoning.Started, Reasoning.Delta, Reasoning.Ended, Retried, Compaction.Started, Compaction.Delta, Compaction.Ended], {
  mode: "oneOf"
}).pipe(Schema.toTaggedUnion("type"));

// user
// assistant
// assistant
// assistant
// user
// compaction marker
// -> text
// assistant

export * as SessionEvent from "./session-event.js";