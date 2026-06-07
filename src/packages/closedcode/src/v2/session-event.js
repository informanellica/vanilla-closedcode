import { SessionID } from "@/session/schema.js";
import { NonNegativeInt } from "@/util/schema.js";
import { EventV2 } from "./event.js";
import { FileAttachment, Prompt } from "./session-prompt.js";
import { Schema } from "effect";
export { FileAttachment };
import { ToolOutput } from "./tool-output.js";
import { ModelID, ProviderID } from "@/provider/schema.js";
import { V2Schema } from "./schema.js";
export const Source = Schema.Struct({
  start: NonNegativeInt,
  end: NonNegativeInt,
  text: Schema.String
}).annotate({
  identifier: "session.next.event.source"
});
const Base = {
  timestamp: V2Schema.DateTimeUtcFromMillis,
  sessionID: SessionID
};
export const AgentSwitched = EventV2.define({
  type: "session.next.agent.switched",
  aggregate: "sessionID",
  version: 1,
  schema: {
    ...Base,
    agent: Schema.String
  }
});
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
export const Prompted = EventV2.define({
  type: "session.next.prompted",
  aggregate: "sessionID",
  version: 1,
  schema: {
    ...Base,
    prompt: Prompt
  }
});
export const Synthetic = EventV2.define({
  type: "session.next.synthetic",
  aggregate: "sessionID",
  schema: {
    ...Base,
    text: Schema.String
  }
});
export let Shell;
(function (_Shell) {
  const Started = _Shell.Started = EventV2.define({
    type: "session.next.shell.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      callID: Schema.String,
      command: Schema.String
    }
  });
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
export let Step;
(function (_Step) {
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
export let Text;
(function (_Text) {
  const Started = _Text.Started = EventV2.define({
    type: "session.next.text.started",
    aggregate: "sessionID",
    schema: {
      ...Base
    }
  });
  const Delta = _Text.Delta = EventV2.define({
    type: "session.next.text.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      delta: Schema.String
    }
  });
  const Ended = _Text.Ended = EventV2.define({
    type: "session.next.text.ended",
    aggregate: "sessionID",
    schema: {
      ...Base,
      text: Schema.String
    }
  });
})(Text || (Text = {}));
export let Reasoning;
(function (_Reasoning) {
  const Started = _Reasoning.Started = EventV2.define({
    type: "session.next.reasoning.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reasoningID: Schema.String
    }
  });
  const Delta = _Reasoning.Delta = EventV2.define({
    type: "session.next.reasoning.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reasoningID: Schema.String,
      delta: Schema.String
    }
  });
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
export let Tool;
(function (_Tool) {
  let Input;
  (function (_Input) {
    const Started = _Input.Started = EventV2.define({
      type: "session.next.tool.input.started",
      aggregate: "sessionID",
      schema: {
        ...Base,
        callID: Schema.String,
        name: Schema.String
      }
    });
    const Delta = _Input.Delta = EventV2.define({
      type: "session.next.tool.input.delta",
      aggregate: "sessionID",
      schema: {
        ...Base,
        callID: Schema.String,
        delta: Schema.String
      }
    });
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
export const Retried = EventV2.define({
  type: "session.next.retried",
  aggregate: "sessionID",
  schema: {
    ...Base,
    attempt: NonNegativeInt,
    error: RetryError
  }
});
export let Compaction;
(function (_Compaction) {
  const Started = _Compaction.Started = EventV2.define({
    type: "session.next.compaction.started",
    aggregate: "sessionID",
    schema: {
      ...Base,
      reason: Schema.Union([Schema.Literal("auto"), Schema.Literal("manual")])
    }
  });
  const Delta = _Compaction.Delta = EventV2.define({
    type: "session.next.compaction.delta",
    aggregate: "sessionID",
    schema: {
      ...Base,
      text: Schema.String
    }
  });
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