// test:leaks watchdog handshake — preload.js spawns a detached child that
// sends SIGHUP 5s after teardown so jest can exit cleanly even with the
// framework Timer leak. Registering the handler here (in the config loaded
// by Node directly) puts it on the real process object, where the signal
// lands — handlers registered inside jest's vm-modules sandbox via
// setupFiles don't catch host signals.
if (process.env.JEST_NO_FORCE_EXIT === "1") {
  process.on("SIGHUP", () => process.exit(0));
}

/** @type {import("jest").Config} */
export default {
  testEnvironment: "node",
  moduleFileExtensions: ["js", "json"],
  moduleNameMapper: {
    "^#tui/(.*)$": "<rootDir>/src/cli/cmd/tui/$1",
    "^#test/(.*)$": "<rootDir>/test/$1",
    "^#pty$": "<rootDir>/src/pty/pty.node.js",
    "^#(.*)$": "<rootDir>/src/$1",
    "^@opentui/core-(darwin|linux|win32)-(arm64|x64)/index\\.js$": "<rootDir>/test/lib/opentui-native-stub.js",
    "^@opentui/solid/runtime-plugin-support(/configure)?$": "<rootDir>/test/lib/opentui-solid-runtime-stub.js",
  },
  setupFiles: ["<rootDir>/test/setup-globals.js"],
  setupFilesAfterEnv: ["<rootDir>/test/preload.js"],
  testMatch: ["<rootDir>/test/**/*.test.js"],
  transformIgnorePatterns: ["/node_modules/(?!(@opentui)/)"],
  // forceExit defaults to true because effect's ManagedRuntime + jest's
  // --experimental-vm-modules loader leave a handful of unref-able internal
  // timers alive that don't expose via _getActiveHandles. Without it suites
  // that exercise the server graph (httpapi-workspace etc.) hang for ~30s
  // after the last test passes.
  //
  // `npm run test:leaks` sets JEST_NO_FORCE_EXIT=1 and --detectOpenHandles
  // so handle leaks in test code get reported. Without forceExit the process
  // would never exit (framework timers keep it alive); preload.js spawns a
  // 5s detached SIGHUP watchdog that the handler above converts into an
  // exit-code-0 termination.
  forceExit: process.env.JEST_NO_FORCE_EXIT !== "1",
};
