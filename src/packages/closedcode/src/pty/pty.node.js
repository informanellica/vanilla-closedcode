/**
 * @file Node.js PTY backend: thin wrapper around `@lydell/node-pty` that
 * exposes a stable, minimal pseudo-terminal process interface to the rest of
 * the codebase.
 */
import * as pty from "@lydell/node-pty";
/**
 * Spawn a pseudo-terminal process and return a normalized handle.
 * @param {string} file - The command/executable to run.
 * @param {Array<string>} args - Arguments passed to the command.
 * @param {Object} opts - Spawn options forwarded to node-pty (e.g. name, cwd, env).
 * @returns {Object} A handle with `pid` and `onData`/`onExit`/`write`/`resize`/`kill` methods.
 */
export function spawn(file, args, opts) {
  const proc = pty.spawn(file, args, opts);
  return {
    pid: proc.pid,
    /**
     * Register a listener for terminal output chunks.
     * @param {Function} listener - Called with each output string chunk.
     * @returns {*} The disposable/subscription returned by node-pty.
     */
    onData(listener) {
      return proc.onData(listener);
    },
    /**
     * Register a listener for process exit.
     * @param {Function} listener - Called with the exit info (e.g. exitCode, signal).
     * @returns {*} The disposable/subscription returned by node-pty.
     */
    onExit(listener) {
      return proc.onExit(listener);
    },
    /**
     * Write data to the terminal's stdin.
     * @param {string} data - The data to write.
     * @returns {void}
     */
    write(data) {
      proc.write(data);
    },
    /**
     * Resize the terminal.
     * @param {number} cols - New column count.
     * @param {number} rows - New row count.
     * @returns {void}
     */
    resize(cols, rows) {
      proc.resize(cols, rows);
    },
    /**
     * Terminate the process.
     * @param {string} signal - Optional signal name (e.g. "SIGTERM").
     * @returns {void}
     */
    kill(signal) {
      proc.kill(signal);
    }
  };
}