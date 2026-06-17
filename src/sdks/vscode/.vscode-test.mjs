/** @file VS Code extension test runner configuration; points @vscode/test-cli at the compiled test suite. */
import { defineConfig } from "@vscode/test-cli"

export default defineConfig({
  files: "out/test/**/*.test.js",
})
