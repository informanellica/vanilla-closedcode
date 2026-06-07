import {  assign, strip  } from "../../../../src/cli/cmd/tui/component/prompt/part.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
describe("prompt part", () => {
  test("strip removes persisted ids from reused file parts", () => {
    const part = {
      id: "prt_old",
      sessionID: "ses_old",
      messageID: "msg_old",
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc"
    };
    expect(strip(part)).toEqual({
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc"
    });
  });
  test("assign overwrites stale runtime ids", () => {
    const part = {
      id: "prt_old",
      sessionID: "ses_old",
      messageID: "msg_old",
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc"
    };
    const next = assign(part);
    expect(next.id).not.toBe("prt_old");
    expect(next.id.startsWith("prt_")).toBe(true);
    expect(next).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc"
    });
  });
});