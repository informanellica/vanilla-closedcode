/** @file Leveled structured logger with tagged service loggers, file rotation, and timing helpers. */
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
/**
 * Decides whether a message at the given level should be emitted under the active level.
 * @param {string} input - The level of the message being considered (DEBUG, INFO, WARN, or ERROR).
 * @returns {boolean} True if the input level's priority meets or exceeds the active level.
 */
function shouldLog(input) {
  return levelPriority[input] >= levelPriority[level];
}
const loggers = new Map();
export const Default = create({
  service: "default"
});
let logpath = "";
/**
 * Returns the path of the current log file.
 * @returns {string} The active log file path, or an empty string before init writes to a file.
 */
export function file() {
  return logpath;
}
let write = msg => {
  process.stderr.write(msg);
  return msg.length;
};
/**
 * Initializes the logger: sets the active level, prunes old log files, and (unless printing
 * to stderr only) opens a log file and redirects the write sink to it.
 * @param {Object} options - Initialization options.
 * @param {string} options.level - Active log level to set (DEBUG, INFO, WARN, or ERROR).
 * @param {boolean} options.print - When true, keep writing to stderr and do not open a file.
 * @param {boolean} options.dev - When true, use a fixed "dev.log" file instead of a timestamped name.
 * @returns {Promise<void>} A promise that resolves once the file sink is ready.
 */
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
/**
 * Removes the oldest timestamped log files in a directory, keeping only the most recent ones.
 * @param {string} dir - Directory to scan for timestamped log files.
 * @returns {Promise<void>} A promise that resolves once excess files are deleted.
 */
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
/**
 * Builds a single-line representation of an error, recursively appending any nested causes.
 * Recursion is capped at a fixed depth to avoid runaway cause chains.
 * @param {Error} error - The error to format.
 * @param {number} depth - Current recursion depth; callers should omit it. Defaults to 0.
 * @returns {string} The error message, with " Caused by: ..." appended for each nested cause.
 */
function formatError(error, depth = 0) {
  const result = error.message;
  return error.cause instanceof Error && depth < 10 ? result + " Caused by: " + formatError(error.cause, depth + 1) : result;
}
let last = Date.now();
/**
 * Creates (or returns a cached) logger that prefixes every line with the given tags.
 * Loggers carrying a string "service" tag are memoized and reused.
 * @param {Object} tags - Key/value tags prepended to each log line; may include a "service" name.
 * @returns {Object} A logger with debug, info, warn, error, tag, clone, and time methods.
 */
export function create(tags) {
  tags = tags || {};
  const service = tags["service"];
  if (service && typeof service === "string") {
    const cached = loggers.get(service);
    if (cached) {
      return cached;
    }
  }
  /**
   * Formats a single log line: timestamp, elapsed time since the previous line, tag prefix, and message.
   * @param {string} message - The log message body.
   * @param {Object} extra - Additional one-off tags merged over the logger's base tags.
   * @returns {string} A formatted log line terminated by a newline.
   */
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
    /**
     * Writes a DEBUG-level log line when the active level permits it.
     * @param {string} message - The log message body.
     * @param {Object} extra - Additional one-off tags merged over the logger's base tags.
     */
    debug(message, extra) {
      if (shouldLog("DEBUG")) {
        write("DEBUG " + build(message, extra));
      }
    },
    /**
     * Writes an INFO-level log line when the active level permits it.
     * @param {string} message - The log message body.
     * @param {Object} extra - Additional one-off tags merged over the logger's base tags.
     */
    info(message, extra) {
      if (shouldLog("INFO")) {
        write("INFO  " + build(message, extra));
      }
    },
    /**
     * Writes an ERROR-level log line when the active level permits it.
     * @param {string} message - The log message body.
     * @param {Object} extra - Additional one-off tags merged over the logger's base tags.
     */
    error(message, extra) {
      if (shouldLog("ERROR")) {
        write("ERROR " + build(message, extra));
      }
    },
    /**
     * Writes a WARN-level log line when the active level permits it.
     * @param {string} message - The log message body.
     * @param {Object} extra - Additional one-off tags merged over the logger's base tags.
     */
    warn(message, extra) {
      if (shouldLog("WARN")) {
        write("WARN  " + build(message, extra));
      }
    },
    /**
     * Adds or overwrites a base tag on this logger.
     * @param {string} key - Tag name.
     * @param {*} value - Tag value.
     * @returns {Object} This logger, for chaining.
     */
    tag(key, value) {
      if (tags) tags[key] = value;
      return result;
    },
    /**
     * Creates a new logger that copies this logger's current tags.
     * @returns {Object} A new logger instance with the same base tags.
     */
    clone() {
      return create({
        ...tags
      });
    },
    /**
     * Logs a "started" message and returns a handle that logs a "completed" message with duration.
     * The returned handle also implements Symbol.dispose so it can be used with `using`.
     * @param {string} message - The message describing the timed operation.
     * @param {Object} extra - Additional tags included on both the start and completion lines.
     * @returns {Object} A handle with a stop method (and Symbol.dispose) to mark completion.
     */
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