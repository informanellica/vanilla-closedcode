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
export const Event = {
  Updated: BusEvent.define("installation.updated", Schema.Struct({
    version: Schema.String
  })),
  UpdateAvailable: BusEvent.define("installation.update-available", Schema.Struct({
    version: Schema.String
  }))
};
export function getReleaseType(current, latest) {
  const currMajor = semver.major(current);
  const currMinor = semver.minor(current);
  const newMajor = semver.major(latest);
  const newMinor = semver.minor(latest);
  if (newMajor > currMajor) return "major";
  if (newMinor > currMinor) return "minor";
  return "patch";
}
export const Info = z.object({
  version: z.string(),
  latest: z.string()
}).meta({
  ref: "InstallationInfo"
});
export const USER_AGENT = `closedcode/${InstallationChannel}/${InstallationVersion}/${Flag.CLOSEDCODE_CLIENT}`;
export function isPreview() {
  return InstallationChannel !== "latest";
}
export function isLocal() {
  return InstallationChannel === "local";
}
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
export class Service extends Context.Service()("@closedcode/Installation") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http));
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
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
  const result = {
    info: Effect.fn("Installation.info")(function* () {
      return {
        version: InstallationVersion,
        latest: yield* result.latest()
      };
    }),
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
    latest: Effect.fn("Installation.latest")(function* (installMethod) {
      // No update check: never reach out to a remote registry/release endpoint.
      // This build is distributed as a signed installer, not a package-managed CLI.
      return InstallationVersion;
    }, Effect.orDie),
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
export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(CrossSpawnSpawner.defaultLayer));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
export const latest = (...args) => runPromise(s => s.latest(...args));
export const method = () => runPromise(s => s.method());
export const upgrade = (...args) => runPromise(s => s.upgrade(...args));
export * as Installation from "./index.js";