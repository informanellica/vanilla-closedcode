import {  Schema  } from "effect"
import {  ProjectID  } from "../../src/project/schema.js"
import {  MessageID, SessionID  } from "../../src/session/schema.js"
import {  Session  } from "../../src/session/session.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
const info = {
  id: SessionID.descending(),
  slug: "test-session",
  projectID: ProjectID.global,
  workspaceID: undefined,
  directory: "/tmp/opencode",
  parentID: undefined,
  summary: undefined,
  share: undefined,
  title: "Test session",
  version: "1.0.0",
  time: {
    created: 1,
    updated: 2,
    compacting: undefined,
    archived: undefined
  },
  permission: undefined,
  revert: undefined
};
describe("Session schema", () => {
  test("encodes undefined optional session fields as omitted keys", () => {
    const encoded = Schema.encodeUnknownSync(Session.Info)(info);
    for (const key of ["workspaceID", "parentID", "summary", "share", "permission", "revert"]) {
      expect(Object.hasOwn(encoded, key)).toBe(false);
    }
    expect(Object.hasOwn(encoded.time, "compacting")).toBe(false);
    expect(Object.hasOwn(encoded.time, "archived")).toBe(false);
    expect(JSON.stringify(encoded)).not.toContain("parentID");
  });
  test("encodes undefined optional global session project fields as omitted keys", () => {
    const encoded = Schema.encodeUnknownSync(Session.GlobalInfo)({
      ...info,
      project: {
        id: ProjectID.global,
        name: undefined,
        worktree: "/tmp/opencode"
      }
    });
    expect(Object.hasOwn(encoded, "parentID")).toBe(false);
    expect(Object.hasOwn(encoded.project, "name")).toBe(false);
  });
  test("encodes nested undefined optional session fields as omitted keys", () => {
    const encoded = Schema.encodeUnknownSync(Session.Info)({
      ...info,
      summary: {
        additions: 1,
        deletions: 2,
        files: 3,
        diffs: undefined
      },
      revert: {
        messageID: MessageID.ascending(),
        partID: undefined,
        snapshot: undefined,
        diff: undefined
      }
    });
    expect(Object.hasOwn(encoded.summary, "diffs")).toBe(false);
    for (const key of ["partID", "snapshot", "diff"]) {
      expect(Object.hasOwn(encoded.revert, key)).toBe(false);
    }
  });
});