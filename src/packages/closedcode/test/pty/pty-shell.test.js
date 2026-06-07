import {  Effect  } from "effect"
import {  tmpdir  } from "../fixture/fixture.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  Pty  } from "../../src/pty/index.js"
import {  Shell  } from "../../src/shell/shell.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import { which } from "../lib/io.js";

Shell.preferred.reset();
describe("pty shell args", () => {
  if (process.platform !== "win32") return;
  const ps = which("pwsh") || which("powershell");
  if (ps) {
    test("does not add login args to pwsh", async () => {
      await using dir = await tmpdir();
      await WithInstance.provide({
        directory: dir.path,
        fn: () => AppRuntime.runPromise(Effect.gen(function* () {
          const pty = yield* Pty.Service;
          const info = yield* pty.create({
            command: ps,
            title: "pwsh"
          });
          try {
            expect(info.args).toEqual([]);
          } finally {
            yield* pty.remove(info.id);
          }
        }))
      });
    }, {
      timeout: 30000
    });
  }
  const bash = (() => {
    const shell = Shell.preferred();
    if (Shell.name(shell) === "bash") return shell;
    return Shell.gitbash();
  })();
  if (bash) {
    test("adds login args to bash", async () => {
      await using dir = await tmpdir();
      await WithInstance.provide({
        directory: dir.path,
        fn: () => AppRuntime.runPromise(Effect.gen(function* () {
          const pty = yield* Pty.Service;
          const info = yield* pty.create({
            command: bash,
            title: "bash"
          });
          try {
            expect(info.args).toEqual(["-l"]);
          } finally {
            yield* pty.remove(info.id);
          }
        }))
      });
    }, {
      timeout: 30000
    });
  }
});
describe("pty configured shell", () => {
  test("uses configured shell for default PTY command", async () => {
    const configured = process.platform === "win32" ? which("pwsh") || which("powershell") : which("bash");
    if (!configured) return;
    await using dir = await tmpdir({
      config: {
        shell: Shell.name(configured)
      }
    });
    await WithInstance.provide({
      directory: dir.path,
      fn: () => AppRuntime.runPromise(Effect.gen(function* () {
        const pty = yield* Pty.Service;
        const info = yield* pty.create({
          title: "configured"
        });
        try {
          if (process.platform === "win32") {
            expect(info.command.toLowerCase()).toBe(configured.toLowerCase());
          } else {
            expect(info.command).toBe(configured);
          }
          expect(info.args).toEqual(process.platform === "win32" ? [] : ["-l"]);
        } finally {
          yield* pty.remove(info.id);
        }
      }))
    });
  }, {
    timeout: 30000
  });
});