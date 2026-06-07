import { describe, expect, test } from "@jest/globals";
import { createRefreshQueue } from "./queue.js";
import { directoryKey } from "./utils.js";
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
describe("createRefreshQueue", () => {
  test("clears queued directories by normalized key", async () => {
    const calls = [];
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: directory => {
        calls.push(directory);
      }
    });
    queue.push("C:\\tmp\\demo");
    queue.clear("C:/tmp/demo");
    await tick();
    expect(calls).toEqual([]);
    queue.dispose();
  });
  test("passes the original directory to bootstrapInstance", async () => {
    const calls = [];
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: directory => {
        calls.push(directory);
      }
    });
    queue.push("C:\\tmp\\demo");
    await tick();
    expect(calls).toEqual(["C:\\tmp\\demo"]);
    queue.dispose();
  });
});