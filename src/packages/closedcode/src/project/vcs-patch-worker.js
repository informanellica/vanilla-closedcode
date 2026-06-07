// Worker-thread side of the Vcs.diff patch pipeline. Receives
// `{id, file, before, after}` messages, runs the (synchronous, CPU-heavy)
// formatPatch + structuredPatch off the Electron main thread, and posts
// back `{id, patch}` for each. Keeping this in its own worker means the
// sidecar's event loop stays responsive while hundreds of files are
// being diffed — the renderer doesn't see "アプリケーションが応答しません".
import { parentPort } from "node:worker_threads";
import { formatPatch, structuredPatch } from "diff";

if (!parentPort) {
  throw new Error("vcs-patch-worker.js must be run as a worker_thread");
}

parentPort.on("message", (msg) => {
  const id = msg?.id;
  try {
    const file = String(msg.file ?? "");
    const before = typeof msg.before === "string" ? msg.before : "";
    const after = typeof msg.after === "string" ? msg.after : "";
    const patch = formatPatch(structuredPatch(file, file, before, after, "", "", {
      // 3 lines matches git's default and keeps structuredPatch's diff
      // alignment within O(N) per file. MAX_SAFE_INTEGER forces the
      // algorithm to keep the full file's context aligned, which becomes
      // O(N²) on heavily-modified files (e.g. line-ending re-encoding
      // across a whole repo). The renderer reconstructs hunks, not full
      // files, from the resulting patch.
      context: 3,
    }));
    parentPort.postMessage({ id, patch });
  } catch (e) {
    parentPort.postMessage({
      id,
      patch: "",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
