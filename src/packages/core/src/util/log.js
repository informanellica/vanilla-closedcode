export * as Log from "./log.js";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import * as Global from "../global.js";
import z from "zod";
import { Glob } from "./glob.js";
export const Level = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).meta({
  ref: "LogLevel",
  description: "Log level"
});
const levelPriority = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};
const keep = 10;
let level = "INFO";
function shouldLog(input) {
  return levelPriority[input] >= levelPriority[level];
}
const loggers = new Map();
export const Default = create({
  service: "default"
});
let logpath = "";
export function file() {
  return logpath;
}
let write = msg => {
  process.stderr.write(msg);
  return msg.length;
};
export async function init(options) {
  if (options.level) level = options.level;
  void cleanup(Global.Path.log);
  if (options.print) return;
  logpath = path.join(Global.Path.log, options.dev ? "dev.log" : new Date().toISOString().split(".")[0].replace(/:/g, "") + ".log");
  await fs.truncate(logpath).catch(() => {});
  const stream = createWriteStream(logpath, {
    flags: "a"
  });
  write = async msg => {
    return new Promise((resolve, reject) => {
      stream.write(msg, err => {
        if (err) reject(err);else resolve(msg.length);
      });
    });
  };
}
async function cleanup(dir) {
  const files = (await Glob.scan("????-??-??T??????.log", {
    cwd: dir,
    absolute: false,
    include: "file"
  }).catch(() => [])).filter(file => path.basename(file) === file).sort();
  if (files.length <= keep) return;
  const doomed = files.slice(0, -keep);
  await Promise.all(doomed.map(file => fs.unlink(path.join(dir, file)).catch(() => {})));
}
function formatError(error, depth = 0) {
  const result = error.message;
  return error.cause instanceof Error && depth < 10 ? result + " Caused by: " + formatError(error.cause, depth + 1) : result;
}
let last = Date.now();
export function create(tags) {
  tags = tags || {};
  const service = tags["service"];
  if (service && typeof service === "string") {
    const cached = loggers.get(service);
    if (cached) {
      return cached;
    }
  }
  function build(message, extra) {
    const prefix = Object.entries({
      ...tags,
      ...extra
    }).filter(([_, value]) => value !== undefined && value !== null).map(([key, value]) => {
      const prefix = `${key}=`;
      if (value instanceof Error) return prefix + formatError(value);
      if (typeof value === "object") return prefix + JSON.stringify(value);
      return prefix + value;
    }).join(" ");
    const next = new Date();
    const diff = next.getTime() - last;
    last = next.getTime();
    return [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, message].filter(Boolean).join(" ") + "\n";
  }
  const result = {
    debug(message, extra) {
      if (shouldLog("DEBUG")) {
        write("DEBUG " + build(message, extra));
      }
    },
    info(message, extra) {
      if (shouldLog("INFO")) {
        write("INFO  " + build(message, extra));
      }
    },
    error(message, extra) {
      if (shouldLog("ERROR")) {
        write("ERROR " + build(message, extra));
      }
    },
    warn(message, extra) {
      if (shouldLog("WARN")) {
        write("WARN  " + build(message, extra));
      }
    },
    tag(key, value) {
      if (tags) tags[key] = value;
      return result;
    },
    clone() {
      return create({
        ...tags
      });
    },
    time(message, extra) {
      const now = Date.now();
      result.info(message, {
        status: "started",
        ...extra
      });
      function stop() {
        result.info(message, {
          status: "completed",
          duration: Date.now() - now,
          ...extra
        });
      }
      return {
        stop,
        [Symbol.dispose]() {
          stop();
        }
      };
    }
  };
  if (service && typeof service === "string") {
    loggers.set(service, result);
  }
  return result;
}