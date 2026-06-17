/** @file Effect ChildProcessSpawner implementation backed by the cross-spawn launcher, mapping Effect Command descriptions to Node child processes with full stdio/fd/pipe/kill handling. */
import { NodeFileSystem, NodeSink, NodeStream } from "@effect/platform-node";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Predicate from "effect/Predicate";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner, ExitCode, make as makeSpawner, makeHandle, ProcessId } from "effect/unstable/process/ChildProcessSpawner";
import * as NodeChildProcess from "node:child_process";
import { PassThrough } from "node:stream";
import launch from "cross-spawn";
/**
 * Coerce an arbitrary thrown value into an Error instance.
 * @param {*} err - The thrown value.
 * @returns {Error} err itself if already an Error, otherwise a new Error wrapping its string form.
 */
const toError = err => err instanceof globalThis.Error ? err : new globalThis.Error(String(err));
/**
 * Map a Node errno code to the corresponding Effect PlatformError tag.
 * @param {Object} err - An error carrying a Node `code` property (e.g. "ENOENT").
 * @returns {string} The PlatformError tag (e.g. "NotFound", "PermissionDenied", "Unknown").
 */
const toTag = err => {
  switch (err.code) {
    case "ENOENT":
      return "NotFound";
    case "EACCES":
      return "PermissionDenied";
    case "EEXIST":
      return "AlreadyExists";
    case "EISDIR":
      return "BadResource";
    case "ENOTDIR":
      return "BadResource";
    case "EBUSY":
      return "Busy";
    case "ELOOP":
      return "BadResource";
    default:
      return "Unknown";
  }
};
/**
 * Flatten a (possibly piped) Command tree into its ordered list of standard
 * commands and the per-join pipe options between them.
 * @param {Object} command - A StandardCommand or PipedCommand description.
 * @returns {Object} An object `{ commands, opts }` where `commands` is the ordered StandardCommand array and `opts` is the array of pipe options.
 */
const flatten = command => {
  const commands = [];
  const opts = [];
  const walk = cmd => {
    switch (cmd._tag) {
      case "StandardCommand":
        commands.push(cmd);
        return;
      case "PipedCommand":
        walk(cmd.left);
        opts.push(cmd.options);
        walk(cmd.right);
        return;
    }
  };
  walk(command);
  if (commands.length === 0) throw new Error("flatten produced empty commands array");
  const [head, ...tail] = commands;
  return {
    commands: [head, ...tail],
    opts
  };
};
/**
 * Build an Effect PlatformError describing a failed child-process syscall,
 * tagging it by errno and embedding the human-readable command pipeline.
 * @param {string} method - The logical operation that failed (e.g. "spawn", "kill").
 * @param {Object} err - The underlying Node error.
 * @param {Object} command - The Command being run when the error occurred.
 * @returns {Object} An Effect PlatformError SystemError.
 */
const toPlatformError = (method, err, command) => {
  const cmd = flatten(command).commands.map(x => `${x.command} ${x.args.join(" ")}`).join(" | ");
  return PlatformError.systemError({
    _tag: toTag(err),
    module: "ChildProcess",
    method,
    pathOrDescriptor: cmd,
    syscall: err.syscall,
    cause: err
  });
};
/**
 * Effect that constructs a cross-spawn-backed ChildProcessSpawner service.
 * Requires FileSystem and Path from the environment and builds the full set of
 * helpers (stdio/fd setup, spawn, kill, pipe wiring) before returning the spawner.
 * @returns {Object} An Effect yielding the ChildProcessSpawner service.
 */
export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  /**
   * Resolve and validate the working directory for a command's options.
   * @param {Object} opts - Command options carrying an optional `cwd`.
   * @returns {Object} An Effect yielding the resolved absolute cwd, or undefined when none was set.
   */
  const cwd = Effect.fnUntraced(function* (opts) {
    if (Predicate.isUndefined(opts.cwd)) return undefined;
    yield* fs.access(opts.cwd);
    return path.resolve(opts.cwd);
  });
  /**
   * Compute the child process environment, optionally merging over the parent env.
   * @param {Object} opts - Command options with `env` and `extendEnv`.
   * @returns {Object} The environment object to pass to the spawn call.
   */
  const env = opts => opts.extendEnv ? {
    ...globalThis.process.env,
    ...opts.env
  } : opts.env;
  /**
   * Reduce a stdin source to a Node stdio token: Streams become "pipe".
   * @param {*} x - A configured stdin source (Stream, string token, etc.).
   * @returns {*} "pipe" for a Stream source, otherwise x unchanged.
   */
  const input = x => Stream.isStream(x) ? "pipe" : x;
  /**
   * Reduce a stdout/stderr sink to a Node stdio token: Sinks become "pipe".
   * @param {*} x - A configured output sink (Sink, string token, etc.).
   * @returns {*} "pipe" for a Sink, otherwise x unchanged.
   */
  const output = x => Sink.isSink(x) ? "pipe" : x;
  /**
   * Normalize a command's stdin configuration into a uniform descriptor.
   * @param {Object} opts - Command options carrying an optional `stdin`.
   * @returns {Object} A descriptor with `stream`, `encoding`, and `endOnDone`.
   */
  const stdin = opts => {
    const cfg = {
      stream: "pipe",
      encoding: "utf-8",
      endOnDone: true
    };
    if (Predicate.isUndefined(opts.stdin)) return cfg;
    if (typeof opts.stdin === "string") return {
      ...cfg,
      stream: opts.stdin
    };
    if (Stream.isStream(opts.stdin)) return {
      ...cfg,
      stream: opts.stdin
    };
    return {
      stream: opts.stdin.stream,
      encoding: opts.stdin.encoding ?? cfg.encoding,
      endOnDone: opts.stdin.endOnDone ?? cfg.endOnDone
    };
  };
  /**
   * Normalize a command's stdout or stderr configuration into a stream descriptor.
   * @param {Object} opts - Command options.
   * @param {string} key - Which stream to read, "stdout" or "stderr".
   * @returns {Object} A descriptor with a `stream` property.
   */
  const stdio = (opts, key) => {
    const cfg = opts[key];
    if (Predicate.isUndefined(cfg)) return {
      stream: "pipe"
    };
    if (typeof cfg === "string") return {
      stream: cfg
    };
    if (Sink.isSink(cfg)) return {
      stream: cfg
    };
    return {
      stream: cfg.stream
    };
  };
  /**
   * Resolve the command's additional file descriptors into a sorted list of
   * numeric fd plus config pairs, dropping unparseable fd names.
   * @param {Object} opts - Command options carrying an optional `additionalFds` map.
   * @returns {Array} An array of `{ fd, config }` entries sorted by fd.
   */
  const fds = opts => {
    if (Predicate.isUndefined(opts.additionalFds)) return [];
    return Object.entries(opts.additionalFds).flatMap(([name, config]) => {
      const fd = ChildProcess.parseFdName(name);
      return Predicate.isUndefined(fd) ? [] : [{
        fd,
        config
      }];
    }).toSorted((a, b) => a.fd - b.fd);
  };
  /**
   * Assemble the Node `stdio` array (indices 0..n) for stdin/stdout/stderr plus
   * any extra fds, using "overlapped" instead of "pipe" on Windows.
   * @param {Object} sin - Normalized stdin descriptor.
   * @param {Object} sout - Normalized stdout descriptor.
   * @param {Object} serr - Normalized stderr descriptor.
   * @param {Array} extra - Additional fd entries from `fds`.
   * @returns {Array} The stdio configuration array for the spawn call.
   */
  const stdios = (sin, sout, serr, extra) => {
    const pipe = x => process.platform === "win32" && x === "pipe" ? "overlapped" : x;
    const arr = [pipe(input(sin.stream)), pipe(output(sout.stream)), pipe(output(serr.stream))];
    if (extra.length === 0) return arr;
    const max = extra.reduce((acc, x) => Math.max(acc, x.fd), 2);
    for (let i = 3; i <= max; i++) arr[i] = "ignore";
    for (const x of extra) arr[x.fd] = pipe("pipe");
    return arr;
  };
  /**
   * Wire up the extra (non-standard) file descriptors of a spawned process,
   * binding each input fd to a Sink and each output fd to a Stream.
   * @param {Object} command - The Command being run (for error context).
   * @param {Object} proc - The spawned Node child process.
   * @param {Array} extra - Additional fd entries from `fds`.
   * @returns {Object} An Effect yielding `{ getInputFd, getOutputFd }` accessor functions.
   */
  const setupFds = Effect.fnUntraced(function* (command, proc, extra) {
    if (extra.length === 0) {
      return {
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty
      };
    }
    const ins = new Map();
    const outs = new Map();
    for (const x of extra) {
      const node = proc.stdio[x.fd];
      switch (x.config.type) {
        case "input":
          {
            let sink = Sink.drain;
            if (node && "write" in node) {
              sink = NodeSink.fromWritable({
                evaluate: () => node,
                onError: err => toPlatformError(`fromWritable(fd${x.fd})`, toError(err), command),
                endOnDone: true
              });
            }
            if (x.config.stream) yield* Effect.forkScoped(Stream.run(x.config.stream, sink));
            ins.set(x.fd, sink);
            break;
          }
        case "output":
          {
            let stream = Stream.empty;
            if (node && "read" in node) {
              const tap = new PassThrough();
              node.on("error", err => tap.destroy(toError(err)));
              node.pipe(tap);
              stream = NodeStream.fromReadable({
                evaluate: () => tap,
                onError: err => toPlatformError(`fromReadable(fd${x.fd})`, toError(err), command)
              });
            }
            if (x.config.sink) stream = Stream.transduce(stream, x.config.sink);
            outs.set(x.fd, stream);
            break;
          }
      }
    }
    return {
      getInputFd: fd => ins.get(fd) ?? Sink.drain,
      getOutputFd: fd => outs.get(fd) ?? Stream.empty
    };
  });
  /**
   * Build the Sink that writes to the child's stdin, and, when the configured
   * stdin is a Stream, fork running that Stream into the Sink.
   * @param {Object} command - The Command being run (for error context).
   * @param {Object} proc - The spawned Node child process.
   * @param {Object} cfg - Normalized stdin descriptor from `stdin`.
   * @returns {Object} An Effect yielding the stdin Sink.
   */
  const setupStdin = (command, proc, cfg) => Effect.suspend(() => {
    let sink = Sink.drain;
    if (Predicate.isNotNull(proc.stdin)) {
      sink = NodeSink.fromWritable({
        evaluate: () => proc.stdin,
        onError: err => toPlatformError("fromWritable(stdin)", toError(err), command),
        endOnDone: cfg.endOnDone,
        encoding: cfg.encoding
      });
    }
    if (Stream.isStream(cfg.stream)) return Effect.as(Effect.forkScoped(Stream.run(cfg.stream, sink)), sink);
    return Effect.succeed(sink);
  });
  /**
   * Build the stdout, stderr, and merged "all" output Streams for a process,
   * applying any user-supplied transducing sinks.
   * @param {Object} command - The Command being run (for error context).
   * @param {Object} proc - The spawned Node child process.
   * @param {Object} out - Normalized stdout descriptor.
   * @param {Object} err - Normalized stderr descriptor.
   * @returns {Object} An object `{ stdout, stderr, all }` of output Streams.
   */
  const setupOutput = (command, proc, out, err) => {
    let stdout = proc.stdout ? NodeStream.fromReadable({
      evaluate: () => proc.stdout,
      onError: cause => toPlatformError("fromReadable(stdout)", toError(cause), command)
    }) : Stream.empty;
    let stderr = proc.stderr ? NodeStream.fromReadable({
      evaluate: () => proc.stderr,
      onError: cause => toPlatformError("fromReadable(stderr)", toError(cause), command)
    }) : Stream.empty;
    if (Sink.isSink(out.stream)) stdout = Stream.transduce(stdout, out.stream);
    if (Sink.isSink(err.stream)) stderr = Stream.transduce(stderr, err.stream);
    return {
      stdout,
      stderr,
      all: Stream.merge(stdout, stderr)
    };
  };
  /**
   * Launch a child process via cross-spawn, resolving once it has spawned and
   * completing a Deferred with the exit info on close; the release interrupts
   * the process with SIGTERM.
   * @param {Object} command - The StandardCommand to run.
   * @param {Object} opts - Node spawn options (cwd, env, stdio, etc.).
   * @returns {Object} An Effect yielding `[proc, signal]` where signal is a Deferred resolved on close.
   */
  const spawn = (command, opts) => Effect.callback(resume => {
    const signal = Deferred.makeUnsafe();
    const proc = launch(command.command, command.args, opts);
    let end = false;
    let exit;
    proc.on("error", err => {
      resume(Effect.fail(toPlatformError("spawn", err, command)));
    });
    proc.on("exit", (...args) => {
      exit = args;
    });
    proc.on("close", (...args) => {
      if (end) return;
      end = true;
      Deferred.doneUnsafe(signal, Exit.succeed(exit ?? args));
    });
    proc.on("spawn", () => {
      resume(Effect.succeed([proc, signal]));
    });
    return Effect.sync(() => {
      proc.kill("SIGTERM");
    });
  });
  /**
   * Kill the process group of a child: `taskkill /T /F` on Windows, otherwise a
   * signal to the negated pid.
   * @param {Object} command - The Command being run (for error context).
   * @param {Object} proc - The spawned Node child process.
   * @param {string} signal - The POSIX signal to send (ignored on Windows).
   * @returns {Object} An Effect that completes when the group has been killed.
   */
  const killGroup = (command, proc, signal) => {
    if (globalThis.process.platform === "win32") {
      return Effect.callback(resume => {
        NodeChildProcess.exec(`taskkill /pid ${proc.pid} /T /F`, {
          windowsHide: true
        }, err => {
          if (err) return resume(Effect.fail(toPlatformError("kill", toError(err), command)));
          resume(Effect.void);
        });
      });
    }
    return Effect.try({
      try: () => {
        globalThis.process.kill(-proc.pid, signal);
      },
      catch: err => toPlatformError("kill", toError(err), command)
    });
  };
  /**
   * Kill a single child process (fallback when group-kill is unavailable).
   * @param {Object} command - The Command being run (for error context).
   * @param {Object} proc - The spawned Node child process.
   * @param {string} signal - The signal to send.
   * @returns {Object} An Effect that fails with a PlatformError if the kill call returns false.
   */
  const killOne = (command, proc, signal) => Effect.suspend(() => {
    if (proc.kill(signal)) return Effect.void;
    return Effect.fail(toPlatformError("kill", new Error("Failed to kill child process"), command));
  });
  /**
   * Wrap a kill function so the configured signal is used first and, if
   * `forceKillAfter` elapses, the process is escalated to SIGKILL.
   * @param {Object} proc - The spawned Node child process.
   * @param {Object} command - The Command being run.
   * @param {Object} opts - Command options carrying optional `killSignal` and `forceKillAfter`.
   * @returns {Function} A function taking a kill helper `f(command, proc, signal)` and returning an Effect.
   */
  const timeout = (proc, command, opts) => f => {
    const signal = opts?.killSignal ?? "SIGTERM";
    if (Predicate.isUndefined(opts?.forceKillAfter)) return f(command, proc, signal);
    return Effect.timeoutOrElse(f(command, proc, signal), {
      duration: opts.forceKillAfter,
      orElse: () => f(command, proc, "SIGKILL")
    });
  };
  /**
   * Select the output Stream of a process handle for a given pipe source name.
   * @param {Object} handle - A spawned process handle exposing stdout/stderr/all and getOutputFd.
   * @param {string} from - The source name ("stdout", "stderr", "all", or an fd name); defaults to "stdout".
   * @returns {Object} The selected output Stream.
   */
  const source = (handle, from) => {
    const opt = from ?? "stdout";
    switch (opt) {
      case "stdout":
        return handle.stdout;
      case "stderr":
        return handle.stderr;
      case "all":
        return handle.all;
      default:
        {
          const fd = ChildProcess.parseFdName(opt);
          return Predicate.isNotUndefined(fd) ? handle.getOutputFd(fd) : handle.stdout;
        }
    }
  };
  /**
   * Spawn a Command and return a process handle. Standard commands are launched
   * directly with full stdio/fd/exit/kill wiring; piped commands are flattened
   * and chained so each stage's chosen output stream feeds the next stage's input.
   * @param {Object} command - A StandardCommand or PipedCommand description.
   * @returns {Object} An Effect (scoped for standard commands) yielding the process handle.
   */
  const spawnCommand = Effect.fnUntraced(function* (command) {
    switch (command._tag) {
      case "StandardCommand":
        {
          const sin = stdin(command.options);
          const sout = stdio(command.options, "stdout");
          const serr = stdio(command.options, "stderr");
          const extra = fds(command.options);
          const dir = yield* cwd(command.options);
          const [proc, signal] = yield* Effect.acquireRelease(spawn(command, {
            cwd: dir,
            env: env(command.options),
            stdio: stdios(sin, sout, serr, extra),
            detached: command.options.detached ?? process.platform !== "win32",
            shell: command.options.shell,
            windowsHide: process.platform === "win32"
          }), Effect.fnUntraced(function* ([proc, signal]) {
            const done = yield* Deferred.isDone(signal);
            const kill = timeout(proc, command, command.options);
            if (done) {
              const [code] = yield* Deferred.await(signal);
              if (process.platform === "win32") return yield* Effect.void;
              if (code !== 0 && Predicate.isNotNull(code)) return yield* Effect.ignore(kill(killGroup));
              return yield* Effect.void;
            }
            const send = s => Effect.catch(killGroup(command, proc, s), () => killOne(command, proc, s));
            const sig = command.options.killSignal ?? "SIGTERM";
            const attempt = send(sig).pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid);
            const escalated = command.options.forceKillAfter ? Effect.timeoutOrElse(attempt, {
              duration: command.options.forceKillAfter,
              orElse: () => send("SIGKILL").pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid)
            }) : attempt;
            return yield* Effect.ignore(escalated);
          }));
          const fd = yield* setupFds(command, proc, extra);
          const out = setupOutput(command, proc, sout, serr);
          let ref = true;
          return makeHandle({
            pid: ProcessId(proc.pid),
            stdin: yield* setupStdin(command, proc, sin),
            stdout: out.stdout,
            stderr: out.stderr,
            all: out.all,
            getInputFd: fd.getInputFd,
            getOutputFd: fd.getOutputFd,
            isRunning: Effect.map(Deferred.isDone(signal), done => !done),
            exitCode: Effect.flatMap(Deferred.await(signal), ([code, signal]) => {
              if (Predicate.isNotNull(code)) return Effect.succeed(ExitCode(code));
              return Effect.fail(toPlatformError("exitCode", new Error(`Process interrupted due to receipt of signal: '${signal}'`), command));
            }),
            kill: opts => {
              const sig = opts?.killSignal ?? "SIGTERM";
              const send = s => Effect.catch(killGroup(command, proc, s), () => killOne(command, proc, s));
              const attempt = send(sig).pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid);
              if (!opts?.forceKillAfter) return attempt;
              return Effect.timeoutOrElse(attempt, {
                duration: opts.forceKillAfter,
                orElse: () => send("SIGKILL").pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid)
              });
            },
            unref: Effect.sync(() => {
              if (ref) {
                proc.unref();
                ref = false;
              }
              return Effect.sync(() => {
                if (!ref) {
                  proc.ref();
                  ref = true;
                }
              });
            })
          });
        }
      case "PipedCommand":
        {
          const flat = flatten(command);
          const [head, ...tail] = flat.commands;
          let handle = spawnCommand(head);
          for (let i = 0; i < tail.length; i++) {
            const next = tail[i];
            const opts = flat.opts[i] ?? {};
            const sin = stdin(next.options);
            const stream = Stream.unwrap(Effect.map(handle, x => source(x, opts.from)));
            const to = opts.to ?? "stdin";
            if (to === "stdin") {
              handle = spawnCommand(ChildProcess.make(next.command, next.args, {
                ...next.options,
                stdin: {
                  ...sin,
                  stream
                }
              }));
              continue;
            }
            const fd = ChildProcess.parseFdName(to);
            if (Predicate.isUndefined(fd)) {
              handle = spawnCommand(ChildProcess.make(next.command, next.args, {
                ...next.options,
                stdin: {
                  ...sin,
                  stream
                }
              }));
              continue;
            }
            handle = spawnCommand(ChildProcess.make(next.command, next.args, {
              ...next.options,
              additionalFds: {
                ...next.options.additionalFds,
                [ChildProcess.fdName(fd)]: {
                  type: "input",
                  stream
                }
              }
            }));
          }
          return yield* handle;
        }
    }
  });
  return makeSpawner(spawnCommand);
});
/** Layer that provides the ChildProcessSpawner service built by {@link make}. */
export const layer = Layer.effect(ChildProcessSpawner, make);
/** {@link layer} with the Node FileSystem and Path dependencies already provided. */
export const defaultLayer = layer.pipe(Layer.provide(NodeFileSystem.layer), Layer.provide(NodePath.layer));
export * as CrossSpawnSpawner from "./cross-spawn-spawner.js";