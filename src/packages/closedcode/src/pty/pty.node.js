import * as pty from "@lydell/node-pty";
export function spawn(file, args, opts) {
  const proc = pty.spawn(file, args, opts);
  return {
    pid: proc.pid,
    onData(listener) {
      return proc.onData(listener);
    },
    onExit(listener) {
      return proc.onExit(listener);
    },
    write(data) {
      proc.write(data);
    },
    resize(cols, rows) {
      proc.resize(cols, rows);
    },
    kill(signal) {
      proc.kill(signal);
    }
  };
}