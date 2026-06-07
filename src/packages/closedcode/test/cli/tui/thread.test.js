import {  tmpdir  } from "../../fixture/fixture.js"
import {  resolveThreadDirectory  } from "../../../src/cli/cmd/tui/thread.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
describe("tui thread", () => {
  async function check(project) {
    await using tmp = await tmpdir({
      git: true
    });
    const link = path.join(path.dirname(tmp.path), path.basename(tmp.path) + "-link");
    const type = process.platform === "win32" ? "junction" : "dir";
    try {
      await fs.symlink(tmp.path, link, type);
      expect(resolveThreadDirectory(project, link, tmp.path)).toBe(tmp.path);
    } finally {
      await fs.rm(link, {
        recursive: true,
        force: true
      }).catch(() => undefined);
    }
  }
  test("uses the real cwd when PWD points at a symlink", async () => {
    await check();
  });
  test("uses the real cwd after resolving a relative project from PWD", async () => {
    await check(".");
  });
});