import { PassThrough } from "node:stream";
import { readPipedStdin } from "../../src/cli/stdin.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

describe("readPipedStdin", () => {
  test("reads immediate piped input to EOF", async () => {
    const stdin = new PassThrough();
    const result = readPipedStdin(100, stdin);
    stdin.write("hello ");
    stdin.write("world");
    stdin.end();
    await expect(result).resolves.toBe("hello world");
  });

  test("resolves empty when nothing arrives within the grace window (hang avoidance)", async () => {
    const stdin = new PassThrough();
    // never written to, never closed — the background/inherited-pipe case
    const result = await readPipedStdin(50, stdin);
    expect(result).toBe("");
  });

  test("SPEC: with a finite grace window, input whose first byte is late is dropped", async () => {
    const stdin = new PassThrough();
    const result = readPipedStdin(50, stdin);
    await sleep(150);
    stdin.write("too late");
    stdin.end();
    // Documented trade-off: the argv-message path accepts this loss in
    // exchange for not hanging on pipes that never close.
    await expect(result).resolves.toBe("");
  });

  test("with Infinity grace (no argv message), a slow first byte is still read to EOF", async () => {
    const stdin = new PassThrough();
    const result = readPipedStdin(Infinity, stdin);
    await sleep(150);
    stdin.write("(sleep 1; echo msg) | closedcode run");
    stdin.end();
    await expect(result).resolves.toBe("(sleep 1; echo msg) | closedcode run");
  });

  test("slow streaming AFTER the first byte is never truncated", async () => {
    const stdin = new PassThrough();
    const result = readPipedStdin(50, stdin);
    stdin.write("a");
    await sleep(120); // longer than the grace window
    stdin.write("b");
    await sleep(120);
    stdin.write("c");
    stdin.end();
    await expect(result).resolves.toBe("abc");
  });
});
