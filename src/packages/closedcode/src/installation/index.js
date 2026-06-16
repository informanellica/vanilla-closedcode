/** @file Installation service: reports the running version/install method and intentionally disables self-update for this signed build. */
import { Effect, Layer, Schema, Context, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { withTransientReadRetry } from "#util/effect-http-client.js";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import path from "path";
import z from "zod";
import { BusEvent } from "#bus/bus-event.js";
import { Flag } from "core/flag/flag";
import * as Log from "core/util/log";
import { makeRuntime } from "core/effect/runtime";
import semver from "semver";
import { InstallationChannel, InstallationVersion } from "core/installation/version";
import { NpmConfig } from "core/npm-config";
const log = Log.create({
  service: "installation"
});
/** Bus events emitted by the installation module (update applied / update available). */
export const Event = {
  Updated: BusEvent.define("installation.updated", Schema.Struct({
    version: Schema.String
  })),
  UpdateAvailable: BusEvent.define("installation.update-available", Schema.Struct({
    version: Schema.String
  }))
};
/**
 * Classify the semver bump between two versions.
 * @param {string} current - Currently installed version.
 * @param {string} latest - Candidate newer version.
 * @returns {string} "major", "minor", or "patch".
 */
export function getReleaseType(current, latest) {
  const currMajor = semver.major(current);
  const currMinor = semver.minor(current);
  const newMajor = semver.major(latest);
  const newMinor = semver.minor(latest);
  if (newMajor > currMajor) return "major";
  if (newMinor > currMinor) return "minor";
  return "patch";
}
/** Zod schema describing installation info: the current version and the latest known version. */
export const Info = z.object({
  version: z.string(),
  latest: z.string()
}).meta({
  ref: "InstallationInfo"
});
/** User-Agent string used for any HTTP requests, encoding channel, version, and client. */
export const USER_AGENT = `closedcode/${InstallationChannel}/${InstallationVersion}/${Flag.CLOSEDCODE_CLIENT}`;
/**
 * Whether this build is on a non-stable (preview) release channel.
 * @returns {boolean} True when the channel is not "latest".
 */
export function isPreview() {
  return InstallationChannel !== "latest";
}
/**
 * Whether this build is a local development install.
 * @returns {boolean} True when the channel is "local".
 */
export function isLocal() {
  return InstallationChannel === "local";
}
/** Tagged error returned when an upgrade attempt fails (carries stderr). */
export class UpgradeFailedError extends Schema.TaggedErrorClass()("UpgradeFailedError", {
  stderr: Schema.String
}) {}

// Response schemas for external version APIs
const GitHubRelease = Schema.Struct({
  tag_name: Schema.String
});
const NpmPackage = Schema.Struct({
  version: Schema.String
});
// Remote version schemas retained for possible future use with a ClosedCode registry.
const BrewFormula = Schema.Struct({
  versions: Schema.Struct({
    stable: Schema.String
  })
});
const BrewInfoV2 = Schema.Struct({
  formulae: Schema.Array(Schema.Struct({
    versions: Schema.Struct({
      stable: Schema.String
    })
  }))
});
const ChocoPackage = Schema.Struct({
  d: Schema.Struct({
    results: Schema.Array(Schema.Struct({
      Version: Schema.String
    }))
  })
});
const ScoopManifest = NpmPackage;
/** Effect Context service tag for the Installation service. */
export class Service extends Context.Service()("@closedcode/Installation") {}
/** Effect Layer constructing the Installation service over an HTTP client and a child-process spawner. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http));
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  /**
   * Run a command and capture only its stdout text, swallowing errors.
   * @param {Array<string>} cmd - Command and arguments; cmd[0] is the executable.
   * @param {Object} opts - Optional spawn options ({cwd, env}).
   * @returns {Effect} Effect yielding stdout as a string ("" on failure).
   */
  const text = Effect.fnUntraced(function* (cmd, opts) {
    const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
      cwd: opts?.cwd,
      env: opts?.env,
      extendEnv: true
    });
    const handle = yield* spawner.spawn(proc);
    const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
    yield* handle.exitCode;
    return out;
  }, Effect.scoped, Effect.catch(() => Effect.succeed("")));
  /**
   * Run a command and capture its exit code and output streams, swallowing spawn errors.
   * @param {Array<string>} cmd - Command and arguments; cmd[0] is the executable.
   * @param {Object} opts - Optional spawn options ({cwd, env}).
   * @returns {Effect} Effect yielding {code, stdout, stderr} (code 1 / empty output on failure).
   */
  const run = Effect.fnUntraced(function* (cmd, opts) {
    const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
      cwd: opts?.cwd,
      env: opts?.env,
      extendEnv: true
    });
    const handle = yield* spawner.spawn(proc);
    const [stdout, stderr] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))], {
      concurrency: 2
    });
    const code = yield* handle.exitCode;
    return {
      code,
      stdout,
      stderr
    };
  }, Effect.scoped, Effect.catch(() => Effect.succeed({
    code: ChildProcessSpawner.ExitCode(1),
    stdout: "",
    stderr: ""
  })));
  /** The Installation service implementation: version info, install-method detection, and (disabled) upgrade. */
  const result = {
    /**
     * Report the current and latest known versions.
     * @returns {Effect} Effect yielding {version, latest}.
     */
    info: Effect.fn("Installation.info")(function* () {
      return {
        version: InstallationVersion,
        latest: yield* result.latest()
      };
    }),
    /**
     * Detect how this build was installed by inspecting the executable path and
     * probing package managers (npm/yarn/pnpm/brew/scoop/choco).
     * @returns {Effect} Effect yielding the install method name, or "unknown".
     */
    method: Effect.fn("Installation.method")(function* () {
      // Prefer ClosedCode install markers
      if (process.execPath.includes(path.join(".closedcode", "bin"))) return "curl";
      if (process.execPath.includes(path.join(".local", "bin"))) return "curl";
      // Legacy fallback: detect old .opencode path for migrated installs
      if (process.execPath.includes(path.join(".opencode", "bin"))) return "curl";
      const exec = process.execPath.toLowerCase();
      const checks = [{
        name: "npm",
        command: () => text(["npm", "list", "-g", "--depth=0"])
      }, {
        name: "yarn",
        command: () => text(["yarn", "global", "list"])
      }, {
        name: "pnpm",
        command: () => text(["pnpm", "list", "-g", "--depth=0"])
      }, {
        name: "brew",
        command: () => text(["brew", "list", "--formula", "closedcode"])
      }, {
        name: "scoop",
        command: () => text(["scoop", "list", "closedcode"])
      }, {
        name: "choco",
        command: () => text(["choco", "list", "--limit-output", "closedcode"])
      }];
      checks.sort((a, b) => {
        const aMatches = exec.includes(a.name);
        const bMatches = exec.includes(b.name);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
      for (const check of checks) {
        const output = yield* check.command();
        if (output.includes("closedcode")) {
          return check.name;
        }
        // npm/yarn/pnpm list all global packages, so a legacy opencode-ai
        // install can appear in the output. Detect it so method() returns a
        // useful value; upgrade() remains disabled regardless.
        if ((check.name === "npm" || check.name === "yarn" || check.name === "pnpm") && output.includes("opencode-ai")) {
          return check.name;
        }
      }
      return "unknown";
    }),
    /**
     * Report the latest available version. This build performs no remote update
     * check, so it always returns the currently installed version.
     * @param {string} installMethod - Install method (unused; kept for signature compatibility).
     * @returns {Effect} Effect yielding the current installed version.
     */
    latest: Effect.fn("Installation.latest")(function* (installMethod) {
      // No update check: never reach out to a remote registry/release endpoint.
      // This build is distributed as a signed installer, not a package-managed CLI.
      return InstallationVersion;
    }, Effect.orDie),
    /**
     * Attempt to self-update. Disabled for this build; always fails.
     * @param {string} m - Install method (unused).
     * @param {string} target - Target version (unused).
     * @returns {Effect} Effect that fails with UpgradeFailedError.
     */
    upgrade: Effect.fn("Installation.upgrade")(function* (m, target) {
      // Self-update is disabled for this build (signed installer, not package-managed).
      // The legacy paths fetched a dead remote install script or ran package-manager
      // commands against the UPSTREAM packages. Refuse for every caller (CLI, HTTP API
      // `global.upgrade`, TUI update prompt).
      return yield* new UpgradeFailedError({ stderr: "Self-update is disabled for this build." });
    })
  };
  return Service.of(result);
}));
/** Installation service Layer with its default HTTP client and cross-spawn spawner dependencies provided. */
export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(CrossSpawnSpawner.defaultLayer));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
/**
 * Promise wrapper around the service's latest() method.
 * @param {...*} args - Arguments forwarded to latest().
 * @returns {Promise<string>} The latest known version.
 */
export const latest = (...args) => runPromise(s => s.latest(...args));
/**
 * Promise wrapper around the service's method() detection.
 * @returns {Promise<string>} The detected install method.
 */
export const method = () => runPromise(s => s.method());
/**
 * Promise wrapper around the service's upgrade() (disabled; rejects).
 * @param {...*} args - Arguments forwarded to upgrade().
 * @returns {Promise<*>} Rejects with UpgradeFailedError.
 */
export const upgrade = (...args) => runPromise(s => s.upgrade(...args));
export * as Installation from "./index.js";