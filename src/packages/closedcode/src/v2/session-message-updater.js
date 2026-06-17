/**
 * Folds session events onto a mutable message list, projecting the event stream into the materialized SessionMessage view.
 * @module closedcode/v2/session-message-updater
 */
import { produce } from "immer";
import { SessionEvent } from "./session-event.js";
import { SessionMessage } from "./session-message.js";

/**
 * Build an in-memory adapter over a mutable state object holding a `messages` array.
 * The adapter exposes get/update/append accessors used by {@link update} to apply events.
 * @param {Object} state - Mutable state with a `messages` array of SessionMessage values.
 * @returns {Object} An adapter with getCurrent/update/append/finish methods.
 */
export function memory(state) {
  /**
   * Index of the most recent assistant message that has not yet completed.
   * @returns {number} The index, or -1 if none.
   */
  const activeAssistantIndex = () => state.messages.findLastIndex(message => message.type === "assistant" && !message.time.completed);
  /**
   * Index of the most recent compaction message.
   * @returns {number} The index, or -1 if none.
   */
  const activeCompactionIndex = () => state.messages.findLastIndex(message => message.type === "compaction");
  /**
   * Index of the most recent shell message matching the given call id.
   * @param {string} callID - The shell call identifier.
   * @returns {number} The index, or -1 if none.
   */
  const activeShellIndex = callID => state.messages.findLastIndex(message => message.type === "shell" && message.callID === callID);
  return {
    /**
     * Get the current in-progress assistant message, if any.
     * @returns {Object} The assistant message, or undefined.
     */
    getCurrentAssistant() {
      const index = activeAssistantIndex();
      if (index < 0) return;
      const assistant = state.messages[index];
      return assistant?.type === "assistant" ? assistant : undefined;
    },
    /**
     * Get the current compaction message, if any.
     * @returns {Object} The compaction message, or undefined.
     */
    getCurrentCompaction() {
      const index = activeCompactionIndex();
      if (index < 0) return;
      const compaction = state.messages[index];
      return compaction?.type === "compaction" ? compaction : undefined;
    },
    /**
     * Get the current shell message for the given call id, if any.
     * @param {string} callID - The shell call identifier.
     * @returns {Object} The shell message, or undefined.
     */
    getCurrentShell(callID) {
      const index = activeShellIndex(callID);
      if (index < 0) return;
      const shell = state.messages[index];
      return shell?.type === "shell" ? shell : undefined;
    },
    /**
     * Replace the current in-progress assistant message in place.
     * @param {Object} assistant - The replacement assistant message.
     * @returns {void}
     */
    updateAssistant(assistant) {
      const index = activeAssistantIndex();
      if (index < 0) return;
      const current = state.messages[index];
      if (current?.type !== "assistant") return;
      state.messages[index] = assistant;
    },
    /**
     * Replace the current compaction message in place.
     * @param {Object} compaction - The replacement compaction message.
     * @returns {void}
     */
    updateCompaction(compaction) {
      const index = activeCompactionIndex();
      if (index < 0) return;
      const current = state.messages[index];
      if (current?.type !== "compaction") return;
      state.messages[index] = compaction;
    },
    /**
     * Replace the current shell message (matched by its call id) in place.
     * @param {Object} shell - The replacement shell message, including its callID.
     * @returns {void}
     */
    updateShell(shell) {
      const index = activeShellIndex(shell.callID);
      if (index < 0) return;
      const current = state.messages[index];
      if (current?.type !== "shell") return;
      state.messages[index] = shell;
    },
    /**
     * Append a new message to the end of the list.
     * @param {Object} message - The message to append.
     * @returns {void}
     */
    appendMessage(message) {
      state.messages.push(message);
    },
    /**
     * Return the underlying state after processing.
     * @returns {Object} The mutated state object.
     */
    finish() {
      return state;
    }
  };
}
/**
 * Apply a single session event to the message list via the given adapter, mutating/appending
 * messages so the projection stays in sync with the event stream.
 * @param {Object} adapter - An adapter as returned by {@link memory}.
 * @param {Object} event - A decoded SessionEvent.All value to fold in.
 * @returns {Object} The result of `adapter.finish()` (the updated state).
 */
export function update(adapter, event) {
  const currentAssistant = adapter.getCurrentAssistant();
  /**
   * Find the most recent tool content block in an assistant message, optionally matching a call id.
   * @param {Object} assistant - The assistant message to search.
   * @param {string} callID - Optional call id to match; when omitted, returns the last tool block.
   * @returns {Object} The matching tool content block, or undefined.
   */
  const latestTool = (assistant, callID) => assistant?.content.findLast(item => item.type === "tool" && (callID === undefined || item.id === callID));
  /**
   * Find the most recent text content block in an assistant message.
   * @param {Object} assistant - The assistant message to search.
   * @returns {Object} The matching text content block, or undefined.
   */
  const latestText = assistant => assistant?.content.findLast(item => item.type === "text");
  /**
   * Find the most recent reasoning content block matching a reasoning id.
   * @param {Object} assistant - The assistant message to search.
   * @param {string} reasoningID - The reasoning id to match.
   * @returns {Object} The matching reasoning content block, or undefined.
   */
  const latestReasoning = (assistant, reasoningID) => assistant?.content.findLast(item => item.type === "reasoning" && item.id === reasoningID);
  SessionEvent.All.match(event, {
    "session.next.agent.switched": event => {
      adapter.appendMessage(new SessionMessage.AgentSwitched({
        id: event.id,
        type: "agent-switched",
        metadata: event.metadata,
        agent: event.data.agent,
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.model.switched": event => {
      adapter.appendMessage(new SessionMessage.ModelSwitched({
        id: event.id,
        type: "model-switched",
        metadata: event.metadata,
        model: {
          id: event.data.id,
          providerID: event.data.providerID,
          variant: event.data.variant
        },
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.prompted": event => {
      adapter.appendMessage(new SessionMessage.User({
        id: event.id,
        type: "user",
        metadata: event.metadata,
        text: event.data.prompt.text,
        files: event.data.prompt.files,
        agents: event.data.prompt.agents,
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.synthetic": event => {
      adapter.appendMessage(new SessionMessage.Synthetic({
        sessionID: event.data.sessionID,
        text: event.data.text,
        id: event.id,
        type: "synthetic",
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.shell.started": event => {
      adapter.appendMessage(new SessionMessage.Shell({
        id: event.id,
        type: "shell",
        metadata: event.metadata,
        callID: event.data.callID,
        command: event.data.command,
        output: "",
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.shell.ended": event => {
      const currentShell = adapter.getCurrentShell(event.data.callID);
      if (currentShell) {
        adapter.updateShell(produce(currentShell, draft => {
          draft.output = event.data.output;
          draft.time.completed = event.data.timestamp;
        }));
      }
    },
    "session.next.step.started": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          draft.time.completed = event.data.timestamp;
        }));
      }
      adapter.appendMessage(new SessionMessage.Assistant({
        id: event.id,
        type: "assistant",
        agent: event.data.agent,
        model: event.data.model,
        time: {
          created: event.data.timestamp
        },
        content: [],
        snapshot: event.data.snapshot ? {
          start: event.data.snapshot
        } : undefined
      }));
    },
    "session.next.step.ended": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          draft.time.completed = event.data.timestamp;
          draft.finish = event.data.finish;
          draft.cost = event.data.cost;
          draft.tokens = event.data.tokens;
          if (event.data.snapshot) draft.snapshot = {
            ...draft.snapshot,
            end: event.data.snapshot
          };
        }));
      }
    },
    "session.next.text.started": () => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          draft.content.push({
            type: "text",
            text: ""
          });
        }));
      }
    },
    "session.next.text.delta": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestText(draft);
          if (match) match.text += event.data.delta;
        }));
      }
    },
    "session.next.text.ended": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestText(draft);
          if (match) match.text = event.data.text;
        }));
      }
    },
    "session.next.tool.input.started": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          draft.content.push({
            type: "tool",
            id: event.data.callID,
            name: event.data.name,
            time: {
              created: event.data.timestamp
            },
            state: {
              status: "pending",
              input: ""
            }
          });
        }));
      }
    },
    "session.next.tool.input.delta": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestTool(draft, event.data.callID);
          // oxlint-disable-next-line no-base-to-string -- event.delta is a Schema.String (runtime string)
          if (match && match.state.status === "pending") match.state.input += event.data.delta;
        }));
      }
    },
    "session.next.tool.input.ended": () => {},
    "session.next.tool.called": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestTool(draft, event.data.callID);
          if (match) {
            match.provider = event.data.provider;
            match.time.ran = event.data.timestamp;
            match.state = {
              status: "running",
              input: event.data.input,
              structured: {},
              content: []
            };
          }
        }));
      }
    },
    "session.next.tool.progress": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestTool(draft, event.data.callID);
          if (match && match.state.status === "running") {
            match.state.structured = event.data.structured;
            match.state.content = [...event.data.content];
          }
        }));
      }
    },
    "session.next.tool.success": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestTool(draft, event.data.callID);
          if (match && match.state.status === "running") {
            match.provider = event.data.provider;
            match.time.completed = event.data.timestamp;
            match.state = {
              status: "completed",
              input: match.state.input,
              structured: event.data.structured,
              content: [...event.data.content]
            };
          }
        }));
      }
    },
    "session.next.tool.error": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestTool(draft, event.data.callID);
          if (match && match.state.status === "running") {
            match.provider = event.data.provider;
            match.time.completed = event.data.timestamp;
            match.state = {
              status: "error",
              error: event.data.error,
              input: match.state.input,
              structured: match.state.structured,
              content: match.state.content
            };
          }
        }));
      }
    },
    "session.next.reasoning.started": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          draft.content.push({
            type: "reasoning",
            id: event.data.reasoningID,
            text: ""
          });
        }));
      }
    },
    "session.next.reasoning.delta": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestReasoning(draft, event.data.reasoningID);
          if (match) match.text += event.data.delta;
        }));
      }
    },
    "session.next.reasoning.ended": event => {
      if (currentAssistant) {
        adapter.updateAssistant(produce(currentAssistant, draft => {
          const match = latestReasoning(draft, event.data.reasoningID);
          if (match) match.text = event.data.text;
        }));
      }
    },
    "session.next.retried": () => {},
    "session.next.compaction.started": event => {
      adapter.appendMessage(new SessionMessage.Compaction({
        id: event.id,
        type: "compaction",
        metadata: event.metadata,
        reason: event.data.reason,
        summary: "",
        time: {
          created: event.data.timestamp
        }
      }));
    },
    "session.next.compaction.delta": event => {
      const currentCompaction = adapter.getCurrentCompaction();
      if (currentCompaction) {
        adapter.updateCompaction(produce(currentCompaction, draft => {
          draft.summary += event.data.text;
        }));
      }
    },
    "session.next.compaction.ended": event => {
      const currentCompaction = adapter.getCurrentCompaction();
      if (currentCompaction) {
        adapter.updateCompaction(produce(currentCompaction, draft => {
          draft.summary = event.data.text;
          draft.include = event.data.include;
        }));
      }
    }
  });
  return adapter.finish();
}
export * as SessionMessageUpdater from "./session-message-updater.js";