import {  Effect, Layer, Stream  } from "effect"
import {  HttpClient, HttpClientResponse  } from "effect/unstable/http"
import {  ChildProcess, ChildProcessSpawner  } from "effect/unstable/process"
import {  Installation  } from "../../src/installation/index.js"
import {  InstallationChannel, InstallationVersion  } from "core/installation/version"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
const encoder = new TextEncoder();
function mockHttpClient(handler) {
  const client = HttpClient.make(request => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))));
  return Layer.succeed(HttpClient.HttpClient, client);
}
function mockSpawner(handler = () => "") {
  const spawner = ChildProcessSpawner.make(command => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined;
    const output = handler(std?.command ?? "", std?.args ?? []);
    return Effect.succeed(ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(0),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      stdin: {
        [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId")
      },
      stdout: output ? Stream.make(encoder.encode(output)) : Stream.empty,
      stderr: Stream.empty,
      all: Stream.empty,
      getInputFd: () => ({
        [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId")
      }),
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void)
    }));
  });
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner);
}
function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
function testLayer(httpHandler, spawnHandler) {
  return Installation.layer.pipe(Layer.provide(mockHttpClient(httpHandler)), Layer.provide(mockSpawner(spawnHandler)));
}
describe("installation", () => {
  describe("latest", () => {
    test("returns the current build version without any network call", async () => {
      const calls = [];
      const layer = testLayer(request => {
        calls.push(request.url);
        return jsonResponse({});
      });
      for (const method of ["unknown", "curl", "npm", "bun", "pnpm", "scoop", "choco", "brew"]) {
        const result = await Effect.runPromise(Installation.Service.use(svc => svc.latest(method)).pipe(Effect.provide(layer)));
        expect(result).toBe(InstallationVersion);
      }
      expect(calls).toHaveLength(0);
    });
  });
});