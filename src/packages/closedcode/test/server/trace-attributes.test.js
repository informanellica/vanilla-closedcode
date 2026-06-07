import {  paramToAttributeKey, requestAttributes  } from "../../src/server/routes/instance/trace.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
function fakeContext(method, url, params) {
  return {
    req: {
      method,
      url,
      param: () => params
    }
  };
}
describe("paramToAttributeKey", () => {
  test("converts fooID to foo.id", () => {
    expect(paramToAttributeKey("sessionID")).toBe("session.id");
    expect(paramToAttributeKey("messageID")).toBe("message.id");
    expect(paramToAttributeKey("partID")).toBe("part.id");
    expect(paramToAttributeKey("projectID")).toBe("project.id");
    expect(paramToAttributeKey("providerID")).toBe("provider.id");
    expect(paramToAttributeKey("ptyID")).toBe("pty.id");
    expect(paramToAttributeKey("permissionID")).toBe("permission.id");
    expect(paramToAttributeKey("requestID")).toBe("request.id");
    expect(paramToAttributeKey("workspaceID")).toBe("workspace.id");
  });
  test("namespaces non-ID params under closedcode.", () => {
    expect(paramToAttributeKey("name")).toBe("closedcode.name");
    expect(paramToAttributeKey("slug")).toBe("closedcode.slug");
  });
});
describe("requestAttributes", () => {
  test("includes http method and path", () => {
    const attrs = requestAttributes(fakeContext("GET", "http://localhost/session", {}));
    expect(attrs["http.method"]).toBe("GET");
    expect(attrs["http.path"]).toBe("/session");
  });
  test("strips query string from path", () => {
    const attrs = requestAttributes(fakeContext("GET", "http://localhost/file/search?query=foo&limit=10", {}));
    expect(attrs["http.path"]).toBe("/file/search");
  });
  test("emits OTel-style <domain>.id for ID-shaped route params", () => {
    const attrs = requestAttributes(fakeContext("GET", "http://localhost/session/ses_abc/message/msg_def/part/prt_ghi", {
      sessionID: "ses_abc",
      messageID: "msg_def",
      partID: "prt_ghi"
    }));
    expect(attrs["session.id"]).toBe("ses_abc");
    expect(attrs["message.id"]).toBe("msg_def");
    expect(attrs["part.id"]).toBe("prt_ghi");
    // No camelCase leftovers:
    expect(attrs["closedcode.sessionID"]).toBeUndefined();
    expect(attrs["closedcode.messageID"]).toBeUndefined();
    expect(attrs["closedcode.partID"]).toBeUndefined();
  });
  test("produces no param attributes when no params are matched", () => {
    const attrs = requestAttributes(fakeContext("POST", "http://localhost/config", {}));
    expect(Object.keys(attrs).filter(k => k !== "http.method" && k !== "http.path")).toEqual([]);
  });
  test("namespaces non-ID params under closedcode. (e.g. mcp :name)", () => {
    const attrs = requestAttributes(fakeContext("POST", "http://localhost/mcp/exa/connect", {
      name: "exa"
    }));
    expect(attrs["closedcode.name"]).toBe("exa");
    expect(attrs["name"]).toBeUndefined();
  });
});