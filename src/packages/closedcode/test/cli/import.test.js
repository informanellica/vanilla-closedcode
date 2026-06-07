import {  parseShareUrl, shouldAttachShareAuthHeaders, transformShareData  } from "../../src/cli/cmd/import.js"
import {  test, expect, beforeAll  } from "@jest/globals"
// parseShareUrl tests
test("parses valid share URLs", () => {
  expect(parseShareUrl("https://share.example.com/share/Jsj3hNIW")).toBe("Jsj3hNIW");
  expect(parseShareUrl("https://custom.example.com/share/abc123")).toBe("abc123");
  expect(parseShareUrl("http://localhost:3000/share/test_id-123")).toBe("test_id-123");
});
test("rejects invalid URLs", () => {
  expect(parseShareUrl("https://share.example.com/s/Jsj3hNIW")).toBeNull(); // legacy format
  expect(parseShareUrl("https://share.example.com/share/")).toBeNull();
  expect(parseShareUrl("https://share.example.com/share/id/extra")).toBeNull();
  expect(parseShareUrl("not-a-url")).toBeNull();
});
test("only attaches share auth headers for same-origin URLs", () => {
  expect(shouldAttachShareAuthHeaders("https://control.example.com/share/abc", "https://control.example.com")).toBe(true);
  expect(shouldAttachShareAuthHeaders("https://other.example.com/share/abc", "https://control.example.com")).toBe(false);
  expect(shouldAttachShareAuthHeaders("https://control.example.com:443/share/abc", "https://control.example.com")).toBe(true);
  expect(shouldAttachShareAuthHeaders("not-a-url", "https://control.example.com")).toBe(false);
});

// transformShareData tests
test("transforms share data to storage format", () => {
  const data = [{
    type: "session",
    data: {
      id: "sess-1",
      title: "Test"
    }
  }, {
    type: "message",
    data: {
      id: "msg-1",
      sessionID: "sess-1"
    }
  }, {
    type: "part",
    data: {
      id: "part-1",
      messageID: "msg-1"
    }
  }, {
    type: "part",
    data: {
      id: "part-2",
      messageID: "msg-1"
    }
  }];
  const result = transformShareData(data);
  expect(result.info.id).toBe("sess-1");
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].parts).toHaveLength(2);
});
test("returns null for invalid share data", () => {
  expect(transformShareData([])).toBeNull();
  expect(transformShareData([{
    type: "message",
    data: {}
  }])).toBeNull();
  expect(transformShareData([{
    type: "session",
    data: {
      id: "s"
    }
  }])).toBeNull(); // no messages
});
