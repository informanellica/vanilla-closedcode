import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { abortAfterAny } from "../../src/util/abort.js";

const MB = 1024 * 1024;
const ITERATIONS = 50;
const heap = () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
  return process.memoryUsage().heapUsed / MB;
};
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("hello from local");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}`;
async function run() {
  const { signal, clearTimeout } = abortAfterAny(30000, new AbortController().signal);
  try {
    const response = await fetch(url, { signal });
    await response.text();
  } finally {
    clearTimeout();
  }
}
try {
  await run();
  await sleep(100);
  const baseline = heap();
  for (let i = 0; i < ITERATIONS; i++) {
    await run();
  }
  await sleep(100);
  const after = heap();
  process.stdout.write(JSON.stringify({
    baseline,
    after,
    growth: after - baseline,
  }));
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
  process.exit(0);
}
