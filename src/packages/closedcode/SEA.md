# Node SEA packaging

`closedcode` ships as a Node [Single Executable Application](https://nodejs.org/api/single-executable-applications.html):
the esbuild bundle is embedded into a copy of the Node binary, so end users run
`closedcode` with no visible Node.

## Layout

```
closedcode/                      # npm wrapper (the published entry; just optionalDeps + launcher)
  bin/closedcode                 # CJS launcher -> resolves the platform pkg, exec's its binary
closedcode-<os>-<arch>[-musl]/   # platform package (one per target)
  bin/closedcode(.exe)           # the SEA executable
  bin/worker.cjs                 # TUI worker_threads entry (sidecar)
  bin/node_modules/              # native + dynamic sidecars (node-pty, tree-sitter*, koffi,
                                 #   terminal-kit, string-kit + their dependency closure)
  bin/assets/                    # prompt/tool .txt assets (read at runtime)
```

`npm i -g closedcode` installs the wrapper + the one platform package matching the
user's os/cpu/libc; `closedcode` then runs that platform's SEA binary.

## Why a CJS bundle + sidecars

SEA runs the embedded main as **CommonJS** (ESM / top-level await fail), and its
`require` is **built-in-only** (a bare `require("node-pty")` throws). A single-file
binary also can't embed `.node` natives, load a worker module, or read `.txt`
files off disk. So the SEA build (`build.js --sea`):

- emits CJS; the entry + TUI worker wrap their top-level await in an async IIFE;
- a banner sets `__ccMetaUrl` (exe file URL, used for `import.meta.url`),
  `__ccRequire` (`createRequire` anchored at the exe dir), and `__ccWorkerPath`;
- the native/dynamic deps are routed through `__ccRequire` and their dependency
  closure is copied to `bin/node_modules`;
- the worker is bundled to `bin/worker.cjs` and loaded from the exe dir.

## Build

Local (host platform):

```sh
node script/build.js --sea          # CJS bundle + worker.cjs + sidecars + assets
node script/sea.js                  # blob -> copy host node -> postject inject -> bin/closedcode(.exe)
node script/wrapper.js              # generate dist/closedcode/ (the npm wrapper)
```

## Releasing the other platforms (no CI)

The native sidecars (node-pty/tree-sitter/koffi) must match the target OS/arch,
and `npm ci` only installs the host's prebuilds — so the simplest path is to run
the same three commands **on each target machine** (a Mac, a Linux box, an Alpine
box) and collect the `dist/closedcode-<target>/` folders:

```sh
node script/build.js --sea          # on Linux musl (Alpine): add --libc musl
node script/sea.js                  # on Linux musl: add --target-libc musl
                                    # macOS: blob injection invalidates the signature, then run:
                                    #   codesign --sign - --force dist/closedcode-darwin-*/bin/closedcode
```

Then, once on any one machine, generate the wrapper and publish everything:

```sh
node script/wrapper.js              # dist/closedcode/  (the npm entry)
# npm publish each dist/closedcode-<target>/ , then dist/closedcode/ last
```

Cross-building from a single host is possible (`sea.js --node <target-node>
--target-os … --target-arch … [--target-libc musl]`) but you must also supply that
target's native prebuilds for the sidecars (e.g. `npm i --os=<os> --cpu=<arch>
--libc=<libc>` into the sidecar tree), so per-machine builds are usually simpler.

## Verified

win-x64 is verified end to end: `closedcode --version`, `--help` (closedcode
wordmark), and `run "..."` (DB migration + assets + agent + a real model response),
including through the wrapper launcher. The interactive TUI (`closedcode` with no
args) exercises `worker.cjs` and needs a real terminal to fully verify.
