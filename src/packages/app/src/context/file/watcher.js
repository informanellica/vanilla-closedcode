/** @file Translates file-watcher SSE events into file-content and directory cache invalidations. */
/**
 * Handle a file-watcher update event by reloading affected open/cached files and refreshing affected directories.
 * Ignores non-watcher events, missing/`.git/` paths; on "change" refreshes the dir itself, on "add"/"unlink" refreshes the parent.
 * @param {Object} event - SSE event; processed only when `type === "file.watcher.updated"` with `properties.file` and `properties.event`.
 * @param {Object} ops - Callbacks `{normalize, hasFile, isOpen, loadFile, node, isDirLoaded, refreshDir}` used to query and mutate file/tree caches.
 * @returns {void}
 */
export function invalidateFromWatcher(event, ops) {
  if (event.type !== "file.watcher.updated") return;
  const props = typeof event.properties === "object" && event.properties ? event.properties : undefined;
  const rawPath = typeof props?.file === "string" ? props.file : undefined;
  const kind = typeof props?.event === "string" ? props.event : undefined;
  if (!rawPath) return;
  if (!kind) return;
  const path = ops.normalize(rawPath);
  if (!path) return;
  if (path.startsWith(".git/")) return;
  if (ops.hasFile(path) || ops.isOpen?.(path)) {
    ops.loadFile(path);
  }
  if (kind === "change") {
    const dir = (() => {
      if (path === "") return "";
      const node = ops.node(path);
      if (node?.type !== "directory") return;
      return path;
    })();
    if (dir === undefined) return;
    if (!ops.isDirLoaded(dir)) return;
    ops.refreshDir(dir);
    return;
  }
  if (kind !== "add" && kind !== "unlink") return;
  const parent = path.split("/").slice(0, -1).join("/");
  if (!ops.isDirLoaded(parent)) return;
  ops.refreshDir(parent);
}