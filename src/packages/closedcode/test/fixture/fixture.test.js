import {  describe, expect, test  } from "@jest/globals"
import {  $  } from "script/shell"
import fs from "fs/promises";
import {  tmpdir  } from "./fixture.js"
describe("tmpdir", () => {
  test("disables fsmonitor for git fixtures", async () => {
    await using tmp = await tmpdir({ git: true });
    const value = (await $`git config core.fsmonitor`.cwd(tmp.path).quiet().text()).trim();
    expect(value).toBe("false");
  });
  test("removes directories on dispose", async () => {
    const tmp = await tmpdir({ git: true });
    const dir = tmp.path;
    await tmp[Symbol.asyncDispose]();
    const exists = await fs.stat(dir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
