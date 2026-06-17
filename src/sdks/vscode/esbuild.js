/** @file esbuild build script for the VS Code extension; bundles src/extension.js to dist/extension.js with watch and production modes. */
const esbuild = require("esbuild")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

/**
 * esbuild plugin that logs build start/finish and prints errors in a format the editor problem matcher can parse.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started")
    })
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)
        console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })
      console.log("[watch] build finished")
    })
  },
}

/**
 * Builds the extension bundle once, or starts a rebuild-on-change watcher when --watch is passed.
 * @returns {Promise<void>} Resolves after the one-shot build, or after the watcher is started.
 */
async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.js"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  })
  if (watch) {
    await ctx.watch()
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
