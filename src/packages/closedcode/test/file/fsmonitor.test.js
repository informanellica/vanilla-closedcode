
import {  Effect  } from "effect"
import {  provideInstance, tmpdir  } from "../fixture/fixture.js"
import {  $  } from "script/shell"
import {  File  } from "../../src/file/index.js"
import {  Instance  } from "../../src/project/instance.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
const run = eff => Effect.runPromise(provideInstance(Instance.directory)(eff.pipe(Effect.provide(File.defaultLayer))));
const status = () => run(File.Service.use(svc => svc.status()));
const read = file => run(File.Service.use(svc => svc.read(file)));
const wintest = process.platform === "win32" ? test : test.skip;
describe("file fsmonitor", () => {
  wintest("status does not start fsmonitor for readonly git checks", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const target = path.join(tmp.path, "tracked.txt");
    await fs.writeFile(target, "base\n");
    await $`git add tracked.txt`.cwd(tmp.path).quiet();
    await $`git commit -m init`.cwd(tmp.path).quiet();
    await $`git config core.fsmonitor true`.cwd(tmp.path).quiet();
    await $`git fsmonitor--daemon stop`.cwd(tmp.path).quiet().nothrow();
    await fs.writeFile(target, "next\n");
    await fs.writeFile(path.join(tmp.path, "new.txt"), "new\n");
    const before = await $`git fsmonitor--daemon status`.cwd(tmp.path).quiet().nothrow();
    expect(before.exitCode).not.toBe(0);
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await status();
      }
    });
    const after = await $`git fsmonitor--daemon status`.cwd(tmp.path).quiet().nothrow();
    expect(after.exitCode).not.toBe(0);
  });
  wintest("read does not start fsmonitor for git diffs", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const target = path.join(tmp.path, "tracked.txt");
    await fs.writeFile(target, "base\n");
    await $`git add tracked.txt`.cwd(tmp.path).quiet();
    await $`git commit -m init`.cwd(tmp.path).quiet();
    await $`git config core.fsmonitor true`.cwd(tmp.path).quiet();
    await $`git fsmonitor--daemon stop`.cwd(tmp.path).quiet().nothrow();
    await fs.writeFile(target, "next\n");
    const before = await $`git fsmonitor--daemon status`.cwd(tmp.path).quiet().nothrow();
    expect(before.exitCode).not.toBe(0);
    await WithInstance.provide({
      directory: tmp.path,
      fn: async () => {
        await read("tracked.txt");
      }
    });
    const after = await $`git fsmonitor--daemon status`.cwd(tmp.path).quiet().nothrow();
    expect(after.exitCode).not.toBe(0);
  });
});