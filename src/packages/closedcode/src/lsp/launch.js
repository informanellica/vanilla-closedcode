import { Process } from "@/util/process.js";
export function spawn(cmd, argsOrOpts, opts) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : [];
  const cfg = Array.isArray(argsOrOpts) ? opts : argsOrOpts;
  const proc = Process.spawn([cmd, ...args], {
    ...cfg,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available");
  return proc;
}