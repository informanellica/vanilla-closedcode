import {  tmpdir  } from "../fixture/fixture.js"
import {  spawn  } from "../../src/lsp/launch.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import { writeFile } from "../lib/io.js";

describe("lsp.launch", () => {
  test("spawns cmd scripts with spaces on Windows", async () => {
    if (process.platform !== "win32") return;
    await using tmp = await tmpdir();
    const dir = path.join(tmp.path, "with space");
    const file = path.join(dir, "echo cmd.cmd");
    await fs.mkdir(dir, {
      recursive: true
    });
    await writeFile(file, "@echo off\r\nif %~1==--stdio exit /b 0\r\nexit /b 7\r\n");
    const proc = spawn(file, ["--stdio"]);
    expect(await proc.exited).toBe(0);
  });
});