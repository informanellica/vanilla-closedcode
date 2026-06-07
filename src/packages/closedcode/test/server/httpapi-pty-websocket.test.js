import {  Effect  } from "effect"
import {  handlePtyInput  } from "../../src/pty/input.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
describe("pty HttpApi websocket input", () => {
  test("does not forward invalid binary frames to the PTY handler", async () => {
    const messages = [];
    const handler = {
      onMessage: message => messages.push(message)
    };
    await Effect.runPromise(handlePtyInput(handler, "ready"));
    await Effect.runPromise(handlePtyInput(handler, new Uint8Array([0xff, 0xfe, 0xfd])));
    await Effect.runPromise(handlePtyInput(handler, new TextEncoder().encode("hello")));
    expect(messages).toEqual(["ready", "hello"]);
  });
});