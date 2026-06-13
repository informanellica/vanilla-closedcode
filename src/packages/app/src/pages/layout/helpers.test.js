import { describe, expect, test } from "@jest/globals";
import { collectNewSessionDeepLinks, collectOpenProjectDeepLinks, drainPendingDeepLinks, parseDeepLink, parseNewSessionDeepLink } from "./deep-links.js";
import { childSessionOnPath, displayName, effectiveWorkspaceOrder, errorMessage, hasProjectPermissions, latestRootSession } from "./helpers.js";
import { pathKey } from "@/utils/path-key.js";
const session = input => ({
  title: "",
  version: "v2",
  parentID: undefined,
  messageCount: 0,
  permissions: {
    session: {},
    share: {}
  },
  time: {
    created: 0,
    updated: 0,
    archived: undefined
  },
  ...input
});
describe("layout deep links", () => {
  test("parses closedcode:// open-project deep links", () => {
    expect(parseDeepLink("closedcode://open-project?directory=/tmp/demo")).toBe("/tmp/demo");
  });
  test("ignores non-project deep links", () => {
    expect(parseDeepLink("closedcode://other?directory=/tmp/demo")).toBeUndefined();
    expect(parseDeepLink("opencode://open-project?directory=/tmp/demo")).toBeUndefined();
    expect(parseDeepLink("https://example.com")).toBeUndefined();
  });
  test("ignores malformed deep links safely", () => {
    expect(() => parseDeepLink("closedcode://open-project/%E0%A4%A%")).not.toThrow();
    expect(parseDeepLink("closedcode://open-project/%E0%A4%A%")).toBeUndefined();
  });
  test("parses links when URL.canParse is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(URL, "canParse");
    Object.defineProperty(URL, "canParse", {
      configurable: true,
      value: undefined
    });
    try {
      expect(parseDeepLink("closedcode://open-project?directory=/tmp/demo")).toBe("/tmp/demo");
    } finally {
      if (original) Object.defineProperty(URL, "canParse", original);
      if (!original) Reflect.deleteProperty(URL, "canParse");
    }
  });
  test("ignores open-project deep links without directory", () => {
    expect(parseDeepLink("closedcode://open-project")).toBeUndefined();
    expect(parseDeepLink("closedcode://open-project?directory=")).toBeUndefined();
  });
  test("collects only valid open-project directories", () => {
    const result = collectOpenProjectDeepLinks(["closedcode://open-project?directory=/a", "closedcode://other?directory=/b", "closedcode://open-project?directory=/c"]);
    expect(result).toEqual(["/a", "/c"]);
  });
  test("ignores opencode:// links when collecting open-project directories", () => {
    const result = collectOpenProjectDeepLinks(["closedcode://open-project?directory=/a", "opencode://open-project?directory=/b"]);
    expect(result).toEqual(["/a"]);
  });
  test("parses closedcode:// new-session deep links with optional prompt", () => {
    expect(parseNewSessionDeepLink("closedcode://new-session?directory=/tmp/demo")).toEqual({
      directory: "/tmp/demo"
    });
    expect(parseNewSessionDeepLink("closedcode://new-session?directory=/tmp/demo&prompt=hello%20world")).toEqual({
      directory: "/tmp/demo",
      prompt: "hello world"
    });
  });
  test("ignores opencode:// new-session deep links", () => {
    expect(parseNewSessionDeepLink("opencode://new-session?directory=/tmp/demo")).toBeUndefined();
  });
  test("ignores new-session deep links without directory", () => {
    expect(parseNewSessionDeepLink("closedcode://new-session")).toBeUndefined();
    expect(parseNewSessionDeepLink("closedcode://new-session?directory=")).toBeUndefined();
  });
  test("collects only valid new-session deep links", () => {
    const result = collectNewSessionDeepLinks(["closedcode://new-session?directory=/a", "closedcode://open-project?directory=/b", "closedcode://new-session?directory=/c&prompt=ship%20it"]);
    expect(result).toEqual([{
      directory: "/a"
    }, {
      directory: "/c",
      prompt: "ship it"
    }]);
  });
  test("drains global deep links once", () => {
    const target = {
      __CLOSEDCODE__: {
        deepLinks: ["closedcode://open-project?directory=/a"]
      }
    };
    expect(drainPendingDeepLinks(target)).toEqual(["closedcode://open-project?directory=/a"]);
    expect(drainPendingDeepLinks(target)).toEqual([]);
  });
});
describe("layout workspace helpers", () => {
  test("normalizes trailing slash in workspace key", () => {
    expect(String(pathKey("/tmp/demo///"))).toBe("/tmp/demo");
    expect(String(pathKey("C:\\tmp\\demo\\\\"))).toBe("C:/tmp/demo");
  });
  test("preserves posix and drive roots in workspace key", () => {
    expect(String(pathKey("/"))).toBe("/");
    expect(String(pathKey("///"))).toBe("/");
    expect(String(pathKey("C:\\"))).toBe("C:/");
    expect(String(pathKey("C://"))).toBe("C:/");
    expect(String(pathKey("C:///"))).toBe("C:/");
  });
  test("keeps local first while preserving known order", () => {
    const result = effectiveWorkspaceOrder("/root", ["/root", "/b", "/c"], ["/root", "/c", "/a", "/b"]);
    expect(result).toEqual(["/root", "/c", "/b"]);
  });
  test("finds the latest root session across workspaces", () => {
    const result = latestRootSession([{
      path: {
        directory: "/root"
      },
      session: [session({
        id: "root",
        directory: "/root",
        time: {
          created: 1,
          updated: 1,
          archived: undefined
        }
      })]
    }, {
      path: {
        directory: "/workspace"
      },
      session: [session({
        id: "workspace",
        directory: "/workspace",
        time: {
          created: 2,
          updated: 2,
          archived: undefined
        }
      })]
    }], 120_000);
    expect(result?.id).toBe("workspace");
  });
  test("detects project permissions with a filter", () => {
    const result = hasProjectPermissions({
      root: [{
        id: "perm-root"
      }, {
        id: "perm-hidden"
      }],
      child: [{
        id: "perm-child"
      }]
    }, item => item.id === "perm-child");
    expect(result).toBe(true);
  });
  test("ignores project permissions filtered out", () => {
    const result = hasProjectPermissions({
      root: [{
        id: "perm-root"
      }]
    }, () => false);
    expect(result).toBe(false);
  });
  test("ignores archived and child sessions when finding latest root session", () => {
    const result = latestRootSession([{
      path: {
        directory: "/workspace"
      },
      session: [session({
        id: "archived",
        directory: "/workspace",
        time: {
          created: 10,
          updated: 10,
          archived: 10
        }
      }), session({
        id: "child",
        directory: "/workspace",
        parentID: "parent",
        time: {
          created: 20,
          updated: 20,
          archived: undefined
        }
      }), session({
        id: "root",
        directory: "/workspace",
        time: {
          created: 30,
          updated: 30,
          archived: undefined
        }
      })]
    }], 120_000);
    expect(result?.id).toBe("root");
  });
  test("finds the direct child on the active session path", () => {
    const list = [session({
      id: "root",
      directory: "/workspace"
    }), session({
      id: "child",
      directory: "/workspace",
      parentID: "root"
    }), session({
      id: "leaf",
      directory: "/workspace",
      parentID: "child"
    })];
    expect(childSessionOnPath(list, "root", "leaf")?.id).toBe("child");
    expect(childSessionOnPath(list, "child", "leaf")?.id).toBe("leaf");
    expect(childSessionOnPath(list, "root", "root")).toBeUndefined();
    expect(childSessionOnPath(list, "root", "other")).toBeUndefined();
  });
  test("formats fallback project display name", () => {
    expect(displayName({
      worktree: "/tmp/app"
    })).toBe("app");
    expect(displayName({
      worktree: "/tmp/app",
      name: "My App"
    })).toBe("My App");
  });
  test("extracts api error message and fallback", () => {
    expect(errorMessage({
      data: {
        message: "boom"
      }
    }, "fallback")).toBe("boom");
    expect(errorMessage(new Error("broken"), "fallback")).toBe("broken");
    expect(errorMessage("unknown", "fallback")).toBe("fallback");
  });
});