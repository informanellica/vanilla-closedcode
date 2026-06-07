import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Failure traces/screenshots land under the repo's artifacts/ dir.
  outputDir: "../../artifacts/playwright",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  // The Electron app's cold-start renderer launch (oc://renderer loading.html ->
  // index.html over the custom protocol) is occasionally slow on Windows and can
  // exceed the launch wait, flaking the first test. Auto-retry keeps the suite
  // deterministic; the underlying cold-start timing is a tracked known flake.
  retries: 2,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
