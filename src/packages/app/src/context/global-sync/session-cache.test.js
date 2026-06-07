import { describe, expect, test } from "@jest/globals";
import { dropSessionCaches, pickSessionCacheEvictions } from "./session-cache.js";
const msg = (id, sessionID) => ({
  id,
  sessionID,
  role: "user",
  time: {
    created: 1
  },
  agent: "assistant",
  model: {
    providerID: "openai",
    modelID: "gpt"
  }
});
const part = (id, sessionID, messageID) => ({
  id,
  sessionID,
  messageID,
  type: "text",
  text: id
});
describe("app session cache", () => {
  test("dropSessionCaches clears orphaned parts without message rows", () => {
    const store = {
      session_status: {
        ses_1: {
          type: "busy"
        }
      },
      session_diff: {
        ses_1: []
      },
      todo: {
        ses_1: []
      },
      message: {},
      part: {
        msg_1: [part("prt_1", "ses_1", "msg_1")]
      },
      permission: {
        ses_1: []
      },
      question: {
        ses_1: []
      }
    };
    dropSessionCaches(store, ["ses_1"]);
    expect(store.message.ses_1).toBeUndefined();
    expect(store.part.msg_1).toBeUndefined();
    expect(store.todo.ses_1).toBeUndefined();
    expect(store.session_diff.ses_1).toBeUndefined();
    expect(store.session_status.ses_1).toBeUndefined();
    expect(store.permission.ses_1).toBeUndefined();
    expect(store.question.ses_1).toBeUndefined();
  });
  test("dropSessionCaches clears message-backed parts", () => {
    const m = msg("msg_1", "ses_1");
    const store = {
      session_status: {},
      session_diff: {},
      todo: {},
      message: {
        ses_1: [m]
      },
      part: {
        [m.id]: [part("prt_1", "ses_1", m.id)]
      },
      permission: {},
      question: {}
    };
    dropSessionCaches(store, ["ses_1"]);
    expect(store.message.ses_1).toBeUndefined();
    expect(store.part[m.id]).toBeUndefined();
  });
  test("pickSessionCacheEvictions preserves requested sessions", () => {
    const seen = new Set(["ses_1", "ses_2", "ses_3"]);
    const stale = pickSessionCacheEvictions({
      seen,
      keep: "ses_4",
      limit: 2,
      preserve: ["ses_1"]
    });
    expect(stale).toEqual(["ses_2", "ses_3"]);
    expect([...seen]).toEqual(["ses_1", "ses_4"]);
  });
});