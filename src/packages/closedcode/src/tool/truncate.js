import { NodePath } from "@effect/platform-node";
import { Cause, Duration, Effect, Layer, Option, Schedule, Context } from "effect";
import path from "path";
import { AppFileSystem } from "core/filesystem";
import { evaluate } from "#permission/evaluate.js";
import { Config } from "#config/config.js";
import { Identifier } from "../id/id.js";
import * as Log from "core/util/log";
import { ToolID } from "./schema.js";
import { TRUNCATION_DIR } from "./truncation-dir.js";
const log = Log.create({
  service: "truncation"
});
const RETENTION = Duration.days(7);
export const MAX_LINES = 2000;
export const MAX_BYTES = 50 * 1024;
export const DIR = TRUNCATION_DIR;
export const GLOB = path.join(TRUNCATION_DIR, "*");
function hasTaskTool(agent) {
  if (!agent?.permission) return false;
  return evaluate("task", "*", agent.permission).action !== "deny";
}
export class Service extends Context.Service()("@closedcode/Truncate") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const cleanup = Effect.fn("Truncate.cleanup")(function* () {
    const cutoff = Identifier.timestamp(Identifier.create("tool", "ascending", Date.now() - Duration.toMillis(RETENTION)));
    const entries = yield* fs.readDirectory(TRUNCATION_DIR).pipe(Effect.map(all => all.filter(name => name.startsWith("tool_"))), Effect.catch(() => Effect.succeed([])));
    for (const entry of entries) {
      if (Identifier.timestamp(entry) >= cutoff) continue;
      yield* fs.remove(path.join(TRUNCATION_DIR, entry)).pipe(Effect.catch(() => Effect.void));
    }
  });
  const write = Effect.fn("Truncate.write")(function* (text) {
    const file = path.join(TRUNCATION_DIR, ToolID.ascending());
    yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie);
    yield* fs.writeFileString(file, text).pipe(Effect.orDie);
    return file;
  });
  const limits = Effect.fn("Truncate.limits")(function* () {
    const configSvc = yield* Effect.serviceOption(Config.Service);
    if (Option.isNone(configSvc)) return {
      maxLines: MAX_LINES,
      maxBytes: MAX_BYTES
    };
    const cfg = yield* configSvc.value.get().pipe(Effect.catch(() => Effect.succeed(undefined)));
    return {
      maxLines: cfg?.tool_output?.max_lines ?? MAX_LINES,
      maxBytes: cfg?.tool_output?.max_bytes ?? MAX_BYTES
    };
  });
  const output = Effect.fn("Truncate.output")(function* (text, options = {}, agent) {
    const resolved = yield* limits();
    const maxLines = options.maxLines ?? resolved.maxLines;
    const maxBytes = options.maxBytes ?? resolved.maxBytes;
    const direction = options.direction ?? "head";
    const lines = text.split("\n");
    const totalBytes = Buffer.byteLength(text, "utf-8");
    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return {
        content: text,
        truncated: false
      };
    }
    const out = [];
    let i = 0;
    let bytes = 0;
    let hitBytes = false;
    if (direction === "head") {
      for (i = 0; i < lines.length && i < maxLines; i++) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0);
        if (bytes + size > maxBytes) {
          hitBytes = true;
          break;
        }
        out.push(lines[i]);
        bytes += size;
      }
    } else {
      for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0);
        if (bytes + size > maxBytes) {
          hitBytes = true;
          break;
        }
        out.unshift(lines[i]);
        bytes += size;
      }
    }
    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
    const unit = hitBytes ? "bytes" : "lines";
    const preview = out.join("\n");
    const file = yield* write(text);
    const hint = hasTaskTool(agent) ? `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.` : `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`;
    return {
      content: direction === "head" ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}` : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`,
      truncated: true,
      outputPath: file
    };
  });
  yield* cleanup().pipe(Effect.catchCause(cause => {
    log.error("truncation cleanup failed", {
      cause: Cause.pretty(cause)
    });
    return Effect.void;
  }), Effect.repeat(Schedule.spaced(Duration.hours(1))), Effect.delay(Duration.minutes(1)), Effect.forkScoped);
  return Service.of({
    cleanup,
    write,
    output,
    limits
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(NodePath.layer));
export * as Truncate from "./truncate.js";