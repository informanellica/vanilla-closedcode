import {  createPluginKeybind  } from "../../../src/cli/cmd/tui/context/plugin-keybinds.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
describe("createPluginKeybind", () => {
  const defaults = {
    open: "ctrl+o",
    close: "escape"
  };
  test("uses defaults when overrides are missing", () => {
    const api = {
      match: () => false,
      print: key => key
    };
    const bind = createPluginKeybind(api, defaults);
    expect(bind.all).toEqual(defaults);
    expect(bind.get("open")).toBe("ctrl+o");
    expect(bind.get("close")).toBe("escape");
  });
  test("applies valid overrides", () => {
    const api = {
      match: () => false,
      print: key => key
    };
    const bind = createPluginKeybind(api, defaults, {
      open: "ctrl+alt+o",
      close: "q"
    });
    expect(bind.all).toEqual({
      open: "ctrl+alt+o",
      close: "q"
    });
  });
  test("ignores invalid overrides", () => {
    const api = {
      match: () => false,
      print: key => key
    };
    const bind = createPluginKeybind(api, defaults, {
      open: "   ",
      close: 1,
      extra: "ctrl+x"
    });
    expect(bind.all).toEqual(defaults);
    expect(bind.get("extra")).toBe("extra");
  });
  test("resolves names for match", () => {
    const list = [];
    const api = {
      match: key => {
        list.push(key);
        return true;
      },
      print: key => key
    };
    const bind = createPluginKeybind(api, defaults, {
      open: "ctrl+shift+o"
    });
    bind.match("open", {
      name: "x"
    });
    bind.match("ctrl+k", {
      name: "x"
    });
    expect(list).toEqual(["ctrl+shift+o", "ctrl+k"]);
  });
  test("resolves names for print", () => {
    const list = [];
    const api = {
      match: () => false,
      print: key => {
        list.push(key);
        return `print:${key}`;
      }
    };
    const bind = createPluginKeybind(api, defaults, {
      close: "q"
    });
    expect(bind.print("close")).toBe("print:q");
    expect(bind.print("ctrl+p")).toBe("print:ctrl+p");
    expect(list).toEqual(["q", "ctrl+p"]);
  });
});