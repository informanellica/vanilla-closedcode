import * as DateTime from "effect/DateTime";
import {  SessionID  } from "../../src/session/schema.js"
import {  EventV2  } from "../../src/v2/event.js"
import {  SessionMessageUpdater  } from "../../src/v2/session-message-updater.js"
import {  expect, test, beforeAll  } from "@jest/globals"
test("step snapshots carry over to assistant messages", () => {
  const state = {
    messages: []
  };
  const sessionID = SessionID.make("session");
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.step.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(1),
      agent: "build",
      model: {
        id: "model",
        providerID: "provider"
      },
      snapshot: "before"
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.step.ended",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(2),
      finish: "stop",
      cost: 0,
      tokens: {
        input: 1,
        output: 2,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0
        }
      },
      snapshot: "after"
    }
  });
  expect(state.messages[0]?.type).toBe("assistant");
  if (state.messages[0]?.type !== "assistant") return;
  expect(state.messages[0].snapshot).toEqual({
    start: "before",
    end: "after"
  });
  expect(state.messages[0].finish).toBe("stop");
});
test("text ended populates assistant text content", () => {
  const state = {
    messages: []
  };
  const sessionID = SessionID.make("session");
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.step.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(1),
      agent: "build",
      model: {
        id: "model",
        providerID: "provider"
      }
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.text.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(2)
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.text.ended",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(3),
      text: "hello assistant"
    }
  });
  expect(state.messages[0]?.type).toBe("assistant");
  if (state.messages[0]?.type !== "assistant") return;
  expect(state.messages[0].content).toEqual([{
    type: "text",
    text: "hello assistant"
  }]);
});
test("tool completion stores completed timestamp", () => {
  const state = {
    messages: []
  };
  const sessionID = SessionID.make("session");
  const callID = "call";
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.step.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(1),
      agent: "build",
      model: {
        id: "model",
        providerID: "provider"
      }
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.tool.input.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(2),
      callID,
      name: "bash"
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.tool.called",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(3),
      callID,
      tool: "bash",
      input: {
        command: "pwd"
      },
      provider: {
        executed: true,
        metadata: {
          source: "provider"
        }
      }
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.tool.success",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(4),
      callID,
      structured: {},
      content: [{
        type: "text",
        text: "/tmp"
      }],
      provider: {
        executed: true,
        metadata: {
          status: "done"
        }
      }
    }
  });
  expect(state.messages[0]?.type).toBe("assistant");
  if (state.messages[0]?.type !== "assistant") return;
  expect(state.messages[0].content[0]?.type).toBe("tool");
  if (state.messages[0].content[0]?.type !== "tool") return;
  expect(state.messages[0].content[0].time.completed).toEqual(DateTime.makeUnsafe(4));
  expect(state.messages[0].content[0].provider).toEqual({
    executed: true,
    metadata: {
      status: "done"
    }
  });
});
test("compaction events reduce to compaction message", () => {
  const state = {
    messages: []
  };
  const sessionID = SessionID.make("session");
  const id = EventV2.ID.create();
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id,
    type: "session.next.compaction.started",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(1),
      reason: "auto"
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.compaction.delta",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(2),
      text: "hello "
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.compaction.delta",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(3),
      text: "summary"
    }
  });
  SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
    id: EventV2.ID.create(),
    type: "session.next.compaction.ended",
    data: {
      sessionID,
      timestamp: DateTime.makeUnsafe(4),
      text: "final summary",
      include: "recent context"
    }
  });
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]).toMatchObject({
    id,
    type: "compaction",
    reason: "auto",
    summary: "final summary",
    include: "recent context",
    time: {
      created: DateTime.makeUnsafe(1)
    }
  });
});