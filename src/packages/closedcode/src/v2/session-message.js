/** @module SessionMessage - Effect Schema classes for the materialized session message view (user/assistant/shell/compaction/etc.) derived from session events. */
import { Schema } from "effect";
import { Prompt } from "./session-prompt.js";
import { SessionEvent } from "./session-event.js";
import { EventV2 } from "./event.js";
import { ToolOutput } from "./tool-output.js";
import { V2Schema } from "./schema.js";

/** Schema for a message identifier, reusing the EventV2 id schema. @type {Object} */
export const ID = EventV2.ID;

/**
 * Common fields shared by every message: id, optional metadata, and a created timestamp.
 * @type {Object}
 */
const Base = {
  id: ID,
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis
  })
};
/** Message marking that the active agent changed. */
export class AgentSwitched extends Schema.Class("Session.Message.AgentSwitched")({
  ...Base,
  type: Schema.Literal("agent-switched"),
  agent: SessionEvent.AgentSwitched.fields.data.fields.agent
}) {}
/** Message marking that the active model (id/provider/variant) changed. */
export class ModelSwitched extends Schema.Class("Session.Message.ModelSwitched")({
  ...Base,
  type: Schema.Literal("model-switched"),
  model: Schema.Struct({
    id: SessionEvent.ModelSwitched.fields.data.fields.id,
    providerID: SessionEvent.ModelSwitched.fields.data.fields.providerID,
    variant: SessionEvent.ModelSwitched.fields.data.fields.variant
  })
}) {}
/** Message representing a user prompt with its text and file/agent attachments. */
export class User extends Schema.Class("Session.Message.User")({
  ...Base,
  text: Prompt.fields.text,
  files: Prompt.fields.files,
  agents: Prompt.fields.agents,
  type: Schema.Literal("user"),
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis
  })
}) {}
/** Message representing a synthetic (system-injected) text entry. */
export class Synthetic extends Schema.Class("Session.Message.Synthetic")({
  ...Base,
  sessionID: SessionEvent.Synthetic.fields.data.fields.sessionID,
  text: SessionEvent.Synthetic.fields.data.fields.text,
  type: Schema.Literal("synthetic")
}) {}
/** Message representing a shell command invocation and its accumulated output. */
export class Shell extends Schema.Class("Session.Message.Shell")({
  ...Base,
  type: Schema.Literal("shell"),
  callID: SessionEvent.Shell.Started.fields.data.fields.callID,
  command: SessionEvent.Shell.Started.fields.data.fields.command,
  output: Schema.String,
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis,
    completed: V2Schema.DateTimeUtcFromMillis.pipe(Schema.optional)
  })
}) {}
/** Tool state while input is still being streamed; `input` is the partial serialized text. */
export class ToolStatePending extends Schema.Class("Session.Message.ToolState.Pending")({
  status: Schema.Literal("pending"),
  input: Schema.String
}) {}
/** Tool state while executing; `input` is parsed and structured/content hold interim output. */
export class ToolStateRunning extends Schema.Class("Session.Message.ToolState.Running")({
  status: Schema.Literal("running"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  structured: ToolOutput.Structured,
  content: ToolOutput.Content.pipe(Schema.Array)
}) {}
/** Tool state after successful completion, holding final content/structured output and any attachments. */
export class ToolStateCompleted extends Schema.Class("Session.Message.ToolState.Completed")({
  status: Schema.Literal("completed"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  attachments: SessionEvent.FileAttachment.pipe(Schema.Array, Schema.optional),
  content: ToolOutput.Content.pipe(Schema.Array),
  structured: ToolOutput.Structured
}) {}
/** Tool state after a failed execution, holding the error type/message alongside the captured output. */
export class ToolStateError extends Schema.Class("Session.Message.ToolState.Error")({
  status: Schema.Literal("error"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  content: ToolOutput.Content.pipe(Schema.Array),
  structured: ToolOutput.Structured,
  error: Schema.Struct({
    type: Schema.String,
    message: Schema.String
  })
}) {}
/**
 * Tagged union of tool execution states (pending/running/completed/error), discriminated on `status`.
 * @type {Object}
 */
export const ToolState = Schema.Union([ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(Schema.toTaggedUnion("status"));

/** Assistant content block representing a tool call, with its current state and timing. */
export class AssistantTool extends Schema.Class("Session.Message.Assistant.Tool")({
  type: Schema.Literal("tool"),
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Struct({
    executed: Schema.Boolean,
    metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional)
  }).pipe(Schema.optional),
  state: ToolState,
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis,
    ran: V2Schema.DateTimeUtcFromMillis.pipe(Schema.optional),
    completed: V2Schema.DateTimeUtcFromMillis.pipe(Schema.optional),
    pruned: V2Schema.DateTimeUtcFromMillis.pipe(Schema.optional)
  })
}) {}
/** Assistant content block of plain text output. */
export class AssistantText extends Schema.Class("Session.Message.Assistant.Text")({
  type: Schema.Literal("text"),
  text: Schema.String
}) {}
/** Assistant content block of reasoning text, keyed by id. */
export class AssistantReasoning extends Schema.Class("Session.Message.Assistant.Reasoning")({
  type: Schema.Literal("reasoning"),
  id: Schema.String,
  text: Schema.String
}) {}

/**
 * Tagged union of assistant content blocks (text/reasoning/tool), discriminated on `type`.
 * @type {Object}
 */
export const AssistantContent = Schema.Union([AssistantText, AssistantReasoning, AssistantTool]).pipe(Schema.toTaggedUnion("type"));

/** Message representing an assistant turn: agent/model, ordered content blocks, timing, cost and token usage. */
export class Assistant extends Schema.Class("Session.Message.Assistant")({
  ...Base,
  type: Schema.Literal("assistant"),
  agent: Schema.String,
  model: SessionEvent.Step.Started.fields.data.fields.model,
  content: AssistantContent.pipe(Schema.Array),
  snapshot: Schema.Struct({
    start: Schema.String.pipe(Schema.optional),
    end: Schema.String.pipe(Schema.optional)
  }).pipe(Schema.optional),
  finish: Schema.String.pipe(Schema.optional),
  cost: Schema.Finite.pipe(Schema.optional),
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({
      read: Schema.Finite,
      write: Schema.Finite
    })
  }).pipe(Schema.optional),
  error: Schema.String.pipe(Schema.optional),
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis,
    completed: V2Schema.DateTimeUtcFromMillis.pipe(Schema.optional)
  })
}) {}
/** Message representing a history compaction marker with its reason and generated summary. */
export class Compaction extends Schema.Class("Session.Message.Compaction")({
  type: Schema.Literal("compaction"),
  reason: SessionEvent.Compaction.Started.fields.data.fields.reason,
  summary: Schema.String,
  include: Schema.String.pipe(Schema.optional),
  ...Base
}) {}
/**
 * Tagged union of every materialized session message type, discriminated on `type`.
 * @type {Object}
 */
export const Message = Schema.Union([AgentSwitched, ModelSwitched, User, Synthetic, Shell, Assistant, Compaction]).pipe(Schema.toTaggedUnion("type")).annotate({
  identifier: "Session.Message"
});
export * as SessionMessage from "./session-message.js";