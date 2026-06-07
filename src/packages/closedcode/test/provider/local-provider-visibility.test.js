import { Effect, Layer } from "effect";
import fs from "fs/promises";
import path from "path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { resetDatabase } from "../fixture/db.js";
import { disposeAllInstances, provideInstance, reloadTestInstance, tmpdir } from "../fixture/fixture.js";
import { testEffect } from "../lib/effect.js";
import { Server } from "../../src/server/server.js";
import * as Log from "core/util/log";
import { afterEach, describe, expect } from "@jest/globals";

void Log.init({ print: false });

const it = testEffect(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer));

// Create a tmpdir with config, register its cleanup as an Effect finalizer so the
// scope tears it down regardless of test outcome.
function scopedTmpdir(config) {
  return Effect.gen(function* () {
    const dir = yield* Effect.promise(() => tmpdir({ config }));
    yield* Effect.addFinalizer(() => Effect.promise(() => dir[Symbol.asyncDispose]()).pipe(Effect.ignore));
    return dir.path;
  });
}

// Issue GET /provider against the REAL legacy server app — the exact route the
// desktop app's provider list depends on. Returns parsed status + body so we can
// assert on the JSON `all`/`connected` arrays.
function getProviders(dir) {
  return Effect.promise(async () => {
    const app = Server.Legacy().app;
    const response = await app.request("/provider", {
      method: "GET",
      headers: { "x-opencode-directory": dir },
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: response.status, body: text, json };
  });
}

function providerIDs(result) {
  if (!result.json) return [];
  return (result.json.all ?? []).map((p) => p.id);
}

const OLLAMA = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://localhost:11434/v1" },
  models: {},
};

const OLLAMA_WITH_MODEL = {
  ...OLLAMA,
  models: {
    "llama3.2": {
      id: "llama3.2",
      name: "Llama 3.2",
      limit: { context: 8192, output: 4096 },
    },
  },
};

afterEach(async () => {
  await disposeAllInstances();
  await resetDatabase();
});

describe("local provider visibility (/provider route)", () => {
  it.live(
    "lists a zero-model config provider (Ollama) without crashing",
    Effect.gen(function* () {
      const dir = yield* scopedTmpdir({ formatter: false, lsp: false, provider: { ollama: OLLAMA } });
      const result = yield* getProviders(dir).pipe(provideInstance(dir));
      // Core regression: before the fix this 500'd (defaultModelIDs crashed) or
      // the provider was dropped at state build because it had zero models.
      expect(result.status).toBe(200);
      const ids = providerIDs(result);
      expect(ids).toContain("ollama");
      // No preselected default model is fine — it just must not crash.
      expect(result.json.default.ollama).toBeUndefined();
    }).pipe(Effect.scoped),
  );

  it.live(
    "lists a config provider that has one model (sanity)",
    Effect.gen(function* () {
      const dir = yield* scopedTmpdir({ formatter: false, lsp: false, provider: { ollama: OLLAMA_WITH_MODEL } });
      const result = yield* getProviders(dir).pipe(provideInstance(dir));
      expect(result.status).toBe(200);
      expect(providerIDs(result)).toContain("ollama");
    }).pipe(Effect.scoped),
  );

  it.live(
    "hides the provider once disabled_providers includes it (trash/disconnect path)",
    Effect.gen(function* () {
      const dir = yield* scopedTmpdir({ formatter: false, lsp: false, provider: { ollama: OLLAMA } });

      // Present to start with.
      const before = yield* getProviders(dir).pipe(provideInstance(dir));
      expect(before.status).toBe(200);
      expect(providerIDs(before)).toContain("ollama");

      // Simulate the app's removeProvider: update config to disable the provider,
      // then rebuild server/provider state (dispose + reload) so the next request
      // sees fresh state — exactly what removeProvider does after disabling.
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            formatter: false,
            lsp: false,
            provider: { ollama: OLLAMA },
            disabled_providers: ["ollama"],
          }),
        ),
      );
      yield* Effect.promise(() => reloadTestInstance({ directory: dir }));

      const after = yield* getProviders(dir).pipe(provideInstance(dir));
      expect(after.status).toBe(200);
      expect(providerIDs(after)).not.toContain("ollama");
    }).pipe(Effect.scoped),
  );
});
