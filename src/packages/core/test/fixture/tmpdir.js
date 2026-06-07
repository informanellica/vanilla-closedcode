import fs from "fs/promises";
import {  tmpdir as osTmpdir  } from "os"
import path from "path";
const tmpdir = async () => {
  const dir = await fs.mkdtemp(path.join(osTmpdir(), "closedcode-core-test-"));
  return {
    path: dir,
    async [Symbol.asyncDispose]() {
      await fs.rm(dir, {
        recursive: true,
        force: true
      });
    }
  };
};
module.exports.tmpdir = tmpdir;
