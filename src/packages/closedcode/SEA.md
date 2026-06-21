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

### linux-x64 via Docker (no Linux box needed)

`Dockerfile.sea-linux` (repo root `src/`) builds the linux-x64 (glibc) package in a
container — it installs the Linux native prebuilds, runs `build.js --sea` +
`sea.js`, and prints the in-container `--version`. `.git` is excluded from the build
context, so the build pins `CLOSEDCODE_VERSION` (a Docker `ENV`) instead of probing
`git branch`. Build + extract (bind mounts hang on Windows, so use `docker cp`):

```sh
docker build -f src/Dockerfile.sea-linux -t cc-sea-linux src/
docker create --name cc-sea-x cc-sea-linux
docker cp cc-sea-x:/app/packages/closedcode/dist/closedcode-linux-x64 ./dist/
docker rm -f cc-sea-x
```

## Signing & notarizing (macOS)

The `codesign --sign -` above is **ad-hoc** — fine for local runs, but a build
distributed to other Macs must be **Developer ID signed + notarized** or
Gatekeeper blocks it. The SEA package has many Mach-O files (native `.node`
addons, node-pty's `spawn-helper`, `.bare` dylibs), and `notarytool` rejects the
archive unless *every* one is signed with a Developer ID cert, a secure
timestamp, and the hardened runtime. `script/sign-mac.sh` discovers them by file
type and signs them all, then re-signs the main binary with the JIT/library
entitlements in `resources/entitlements.mac.plist`:

```sh
node script/build.js --sea          # build.js prunes foreign-arch prebuilds
node script/sea.js                  #   so only this arch's Mach-O remain
CC_MAC_SIGN_ID="Developer ID Application: Name (TEAMID)" \
  script/sign-mac.sh dist/closedcode-darwin-arm64

# notarize the signed package (App Store Connect API key in the env)
ditto -c -k --keepParent dist/closedcode-darwin-arm64 /tmp/cc-darwin-arm64.zip
xcrun notarytool submit /tmp/cc-darwin-arm64.zip \
  --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
```

A bare executable can't have a notarization ticket stapled (only `.app`/`.dmg`/
`.pkg` can), so the ticket is verified online on first run. `build.js`'s prune
step is what keeps notarization green: without it the darwin package ships
x86_64/iOS prebuilds whose unsigned Mach-O fail validation.

## Startup performance (Windows)

A large unsigned SEA can feel slow to launch on Windows for two distinct reasons:

1. **In-process startup (~1 s, warm):** evaluating the bundled module graph (effect,
   sequelize, every command) before the first command runs. Cheap `node` is ~45 ms.
2. **Cold antivirus scan (pre-execution):** Defender scans the ~100 MB unsigned PE
   the first time it runs (and holds a transient file handle — `build.js` retries its
   `dist/<name>/bin` wipe to survive that lock).

To keep an interactive launch from looking hung, the SEA banner writes a one-line
splash to **stderr the instant JS starts** (before the module graph evaluates) —
gated to a TTY and skipped for `--version`/`-v`/`--help`/`-h`/`completion` and
piped/non-TTY output, so scripted use stays clean. A splash cannot help #2 (the
process isn't executing yet). Reduce the cold scan with one of:

- **Code-signing** (`sea.js`, `CC_WIN_SIGN=1` + a cert) — also clears SmartScreen
  (instantly with an EV cert; an OV cert still warns until it accrues reputation).
- **Defender exclusion** for the install dir (per-machine; needs an elevated shell):

  ```powershell
  Add-MpPreference -ExclusionPath "C:\path\to\closedcode-windows-x64"
  ```

- A **smaller binary** — most of the ~100 MB is Node itself, so on Windows there is
  little to strip; the Linux build (`--version` shows it is "not stripped") can be
  `strip`-ped in the Docker stage to shed its debug info.

## Verified

win-x64 is verified end to end: `closedcode --version`, `--help` (closedcode
wordmark), and `run "..."` (DB migration + assets + agent + a real model response),
including through the wrapper launcher. The interactive TUI (`closedcode` with no
args) exercises `worker.cjs` and needs a real terminal to fully verify.
