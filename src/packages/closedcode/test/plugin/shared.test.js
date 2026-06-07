import {  parsePluginSpecifier, checkPluginCompatibility  } from "../../src/plugin/shared.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
describe("parsePluginSpecifier", () => {
  test("parses standard npm package without version", () => {
    expect(parsePluginSpecifier("acme")).toEqual({
      pkg: "acme",
      version: "latest"
    });
  });
  test("parses standard npm package with version", () => {
    expect(parsePluginSpecifier("acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "1.0.0"
    });
  });
  test("parses scoped npm package without version", () => {
    expect(parsePluginSpecifier("@opencode/acme")).toEqual({
      pkg: "@opencode/acme",
      version: "latest"
    });
  });
  test("parses scoped npm package with version", () => {
    expect(parsePluginSpecifier("@opencode/acme@1.0.0")).toEqual({
      pkg: "@opencode/acme",
      version: "1.0.0"
    });
  });
  test("parses package with git+https url", () => {
    expect(parsePluginSpecifier("acme@git+https://github.com/opencode/acme.git")).toEqual({
      pkg: "acme",
      version: "git+https://github.com/opencode/acme.git"
    });
  });
  test("parses scoped package with git+https url", () => {
    expect(parsePluginSpecifier("@opencode/acme@git+https://github.com/opencode/acme.git")).toEqual({
      pkg: "@opencode/acme",
      version: "git+https://github.com/opencode/acme.git"
    });
  });
  test("parses package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("acme@git+ssh://git@github.com/opencode/acme.git")).toEqual({
      pkg: "acme",
      version: "git+ssh://git@github.com/opencode/acme.git"
    });
  });
  test("parses scoped package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("@opencode/acme@git+ssh://git@github.com/opencode/acme.git")).toEqual({
      pkg: "@opencode/acme",
      version: "git+ssh://git@github.com/opencode/acme.git"
    });
  });
  test("parses unaliased git+ssh url", () => {
    expect(parsePluginSpecifier("git+ssh://git@github.com/opencode/acme.git")).toEqual({
      pkg: "git+ssh://git@github.com/opencode/acme.git",
      version: ""
    });
  });
  test("parses npm alias using the alias name", () => {
    expect(parsePluginSpecifier("acme@npm:@opencode/acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "npm:@opencode/acme@1.0.0"
    });
  });
  test("parses bare npm protocol specifier using the target package", () => {
    expect(parsePluginSpecifier("npm:@opencode/acme@1.0.0")).toEqual({
      pkg: "@opencode/acme",
      version: "1.0.0"
    });
  });
  test("parses unversioned npm protocol specifier", () => {
    expect(parsePluginSpecifier("npm:@opencode/acme")).toEqual({
      pkg: "@opencode/acme",
      version: "latest"
    });
  });
});

describe("checkPluginCompatibility", () => {
  const makePkg = (engines) => ({ json: { engines } });

  test("passes when engines.closedcode range is satisfied", async () => {
    await expect(checkPluginCompatibility("dummy", "1.5.0", makePkg({ closedcode: "^1.0.0" }))).resolves.toBeUndefined();
  });

  test("throws when engines.closedcode range is not satisfied", async () => {
    await expect(checkPluginCompatibility("dummy", "2.0.0", makePkg({ closedcode: "^1.0.0" }))).rejects.toThrow("Plugin requires closedcode ^1.0.0 but running 2.0.0");
  });

  test("falls back to engines.opencode when engines.closedcode is absent", async () => {
    await expect(checkPluginCompatibility("dummy", "1.5.0", makePkg({ opencode: "^1.0.0" }))).resolves.toBeUndefined();
    await expect(checkPluginCompatibility("dummy", "2.0.0", makePkg({ opencode: "^1.0.0" }))).rejects.toThrow("Plugin requires closedcode ^1.0.0 but running 2.0.0");
  });

  test("prefers engines.closedcode over engines.opencode", async () => {
    // closedcode says >=2, opencode says ^1 — closedcode wins
    await expect(checkPluginCompatibility("dummy", "2.0.0", makePkg({ closedcode: ">=2.0.0", opencode: "^1.0.0" }))).resolves.toBeUndefined();
    await expect(checkPluginCompatibility("dummy", "1.5.0", makePkg({ closedcode: ">=2.0.0", opencode: "^1.0.0" }))).rejects.toThrow("Plugin requires closedcode >=2.0.0 but running 1.5.0");
  });

  test("skips check when no engines field", async () => {
    await expect(checkPluginCompatibility("dummy", "1.0.0", makePkg(undefined))).resolves.toBeUndefined();
  });

  test("skips check for 0.x versions", async () => {
    await expect(checkPluginCompatibility("dummy", "0.9.0", makePkg({ closedcode: "^1.0.0" }))).resolves.toBeUndefined();
  });
});