import { SessionMessage } from "#v2/session-message.js";
import { SessionMessageUpdater } from "#v2/session-message-updater.js";
import { SessionEvent } from "#v2/session-event.js";
import * as DateTime from "effect/DateTime";
import { SyncEvent } from "#sync/index.js";
import { Schema } from "effect";
const decodeMessage = Schema.decodeUnknownSync(SessionMessage.Message);
function encodeDateTimes(value) {
  if (DateTime.isDateTime(value)) return DateTime.toEpochMillis(value);
  if (Array.isArray(value)) return value.map(encodeDateTimes);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeDateTimes(item)]));
  }
  return value;
}
function encodeMessageData(value) {
  return encodeDateTimes(value);
}
// The migration DDL declares JSON columns as `text`, and sequelize's sqlite
// parser keys off the declared column type, so DataTypes.JSON values come
// back as raw strings; parse to match the drizzle mode:"json" behavior.
const json = value => (typeof value === "string" ? JSON.parse(value) : value);
// SessionMessageUpdater.update is synchronous while sequelize is not: the
// adapter pre-loads the rows the updater may read (within a single event all
// reads happen before all writes) and queues the writes, which are flushed
// in order after the updater returns.
async function sqlite(h, sessionID) {
  const fetch = async type => (await h.models.SessionMessage.findAll({
    where: { session_id: sessionID, type },
    order: [["id", "DESC"]],
    transaction: h.tx
  })).map(row => row.get({ plain: true }));
  const rows = {
    assistant: await fetch("assistant"),
    compaction: await fetch("compaction"),
    shell: await fetch("shell")
  };
  const decoded = {};
  const messages = type => decoded[type] ??= rows[type].map(row => decodeMessage({
    ...json(row.data),
    id: row.id,
    type: row.type
  }));
  const writes = [];
  const set = message => {
    const {
      id,
      type,
      ...data
    } = message;
    writes.push(() => h.models.SessionMessage.update({
      data: encodeMessageData(data)
    }, {
      where: { id, session_id: sessionID, type },
      transaction: h.tx
    }));
  };
  const adapter = {
    getCurrentAssistant() {
      return messages("assistant").find(message => message.type === "assistant" && !message.time.completed);
    },
    getCurrentCompaction() {
      return messages("compaction").find(message => message.type === "compaction");
    },
    getCurrentShell(callID) {
      return messages("shell").find(message => message.type === "shell" && message.callID === callID);
    },
    updateAssistant(assistant) {
      set(assistant);
    },
    updateCompaction(compaction) {
      set(compaction);
    },
    updateShell(shell) {
      set(shell);
    },
    appendMessage(message) {
      const {
        id,
        type,
        ...data
      } = message;
      writes.push(() => h.models.SessionMessage.bulkCreate([{
        id,
        session_id: sessionID,
        type,
        time_created: DateTime.toEpochMillis(message.time.created),
        data: encodeMessageData(data)
      }], { transaction: h.tx }));
    },
    finish() {}
  };
  return {
    adapter,
    flush: async () => {
      for (const write of writes) await write();
    }
  };
}
async function update(h, event) {
  const store = await sqlite(h, event.data.sessionID);
  SessionMessageUpdater.update(store.adapter, event);
  await store.flush();
}
export default [SyncEvent.project(SessionEvent.AgentSwitched.Sync, async (h, data, event) => {
  await h.models.Session.update({
    agent: data.agent,
    time_updated: DateTime.toEpochMillis(data.timestamp)
  }, {
    where: { id: data.sessionID },
    transaction: h.tx
  });
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.agent.switched",
    data
  });
}), SyncEvent.project(SessionEvent.ModelSwitched.Sync, async (h, data, event) => {
  await h.models.Session.update({
    model: {
      id: data.id,
      providerID: data.providerID,
      variant: data.variant
    },
    time_updated: DateTime.toEpochMillis(data.timestamp)
  }, {
    where: { id: data.sessionID },
    transaction: h.tx
  });
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.model.switched",
    data
  });
}), SyncEvent.project(SessionEvent.Prompted.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.prompted",
    data
  });
}), SyncEvent.project(SessionEvent.Synthetic.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.synthetic",
    data
  });
}), SyncEvent.project(SessionEvent.Shell.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.shell.started",
    data
  });
}), SyncEvent.project(SessionEvent.Shell.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.shell.ended",
    data
  });
}), SyncEvent.project(SessionEvent.Step.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.step.started",
    data
  });
}), SyncEvent.project(SessionEvent.Step.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.step.ended",
    data
  });
}), SyncEvent.project(SessionEvent.Text.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.text.started",
    data
  });
}), SyncEvent.project(SessionEvent.Text.Delta.Sync, () => {}), SyncEvent.project(SessionEvent.Text.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.text.ended",
    data
  });
}), SyncEvent.project(SessionEvent.Tool.Input.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.tool.input.started",
    data
  });
}), SyncEvent.project(SessionEvent.Tool.Input.Delta.Sync, () => {}), SyncEvent.project(SessionEvent.Tool.Input.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.tool.input.ended",
    data
  });
}), SyncEvent.project(SessionEvent.Tool.Called.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.tool.called",
    data
  });
}), SyncEvent.project(SessionEvent.Tool.Success.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.tool.success",
    data
  });
}), SyncEvent.project(SessionEvent.Tool.Error.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.tool.error",
    data
  });
}), SyncEvent.project(SessionEvent.Reasoning.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.reasoning.started",
    data
  });
}), SyncEvent.project(SessionEvent.Reasoning.Delta.Sync, () => {}), SyncEvent.project(SessionEvent.Reasoning.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.reasoning.ended",
    data
  });
}), SyncEvent.project(SessionEvent.Retried.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.retried",
    data
  });
}), SyncEvent.project(SessionEvent.Compaction.Started.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.compaction.started",
    data
  });
}), SyncEvent.project(SessionEvent.Compaction.Delta.Sync, () => {}), SyncEvent.project(SessionEvent.Compaction.Ended.Sync, async (h, data, event) => {
  await update(h, {
    id: SessionMessage.ID.make(event.id),
    type: "session.next.compaction.ended",
    data
  });
})];
