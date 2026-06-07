import { describe, expect, test } from "@jest/globals";
import { resetSessionModel, syncSessionModel } from "./session-model-helpers.js";
const message = input => ({
  id: "msg",
  sessionID: "session",
  role: "user",
  time: {
    created: 1
  },
  agent: input?.agent ?? "build",
  model: input?.model ?? {
    providerID: "anthropic",
    modelID: "claude-sonnet-4"
  }
});
describe("syncSessionModel", () => {
  test("restores the last message through session state", () => {
    const calls = [];
    syncSessionModel({
      session: {
        restore(value) {
          calls.push(value);
        },
        reset() {}
      }
    }, message({
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4",
        variant: "high"
      }
    }));
    expect(calls).toEqual([message({
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4",
        variant: "high"
      }
    })]);
  });
});
describe("resetSessionModel", () => {
  test("clears draft session state", () => {
    const calls = [];
    resetSessionModel({
      session: {
        reset() {
          calls.push("reset");
        },
        restore() {}
      }
    });
    expect(calls).toEqual(["reset"]);
  });
});