import {  Global  } from "core/global"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import os from "os";
import path from "path";
describe("global paths", () => {
  test("tmp path is under the system temp directory", () => {
    expect(Global.Path.tmp).toBe(path.join(os.tmpdir(), "closedcode"));
    expect(Global.make().tmp).toBe(Global.Path.tmp);
  });
  test("tmp path is created on module load", async () => {
    expect((await fs.stat(Global.Path.tmp)).isDirectory()).toBe(true);
  });
});