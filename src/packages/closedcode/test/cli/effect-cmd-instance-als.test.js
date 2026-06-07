import {  Effect  } from "effect"
import {  disposeAllInstances, provideTestInstance, tmpdir  } from "../fixture/fixture.js"
import {  Instance  } from "../../src/project/instance.js"
import {  afterEach, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
afterEach(async () => {
  await disposeAllInstances();
});

// Regression for PR #25522: when an effectCmd handler does
// `yield* Effect.promise(async () => { ... await runPromise(svcMethod) ... })`,
// the inner runPromise creates a fresh fiber after `await` whose Effect context
// has lost the outer InstanceRef. Services that read `InstanceState.context`
// then fall back to `Instance.current` ALS, which must be installed at the JS
// callback boundary (Node ALS persists across awaits, Effect's fiber context
// does not). `provideTestInstance` mirrors effectCmd's load + ALS-restore wrap.
// Pins effect-cmd.js directly: the pattern test below exercises the load +
// Instance.restore + dispose triple via the shared `provideTestInstance` fixture,
// so a regression that removed `Instance.restore` from effect-cmd.js wouldn't
// fail it. This grep guards the actual production callsite.
test("effect-cmd.js wraps the handler body in Instance.restore", async () => {
  const source = await fs.readFile(new URL("../../src/cli/effect-cmd.js", import.meta.url), "utf8");
  expect(source).toContain("Instance.restore(ctx");
});
test("Instance.current reachable from inner runPromise inside Effect.promise(async)", async () => {
  await using dir = await tmpdir({
    git: true
  });
  await provideTestInstance({
    directory: dir.path,
    fn: () => Effect.runPromise(Effect.promise(async () => {
      await new Promise(r => setTimeout(r, 5));
      const current = await Effect.runPromise(Effect.sync(() => {
        try {
          return Instance.current;
        } catch {
          return undefined;
        }
      }));
      expect(current?.directory).toBe(dir.path);
    }))
  });
});