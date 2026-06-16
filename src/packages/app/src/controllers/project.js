/** @file Project controller (MVC): orchestrates project-metadata persistence and SDK-backed directory browse/search for the project-edit and directory-picker Views, plus pure path-string helpers. */
import { createMemo, createResource } from "../lib/reactivity.js";
import fuzzysort from "fuzzysort";
import { getFilename } from "core/util/path";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLayout } from "@/context/layout.js";

/**
 * Project controller (MVC).
 *
 * Orchestrates the Model (@/context/global-sdk.js, @/context/global-sync.js,
 * @/context/layout.js) and the SDK for the project-metadata + directory-picking
 * Views (dialog-edit-project, dialog-select-directory).
 *
 * Owns:
 *  - Project metadata persistence: `saveProject()` (project.update with avatar
 *    colors / icon override + global-sync meta/icon side effects).
 *  - Directory browse/search: SDK-backed file.list / find.files / path.get
 *    traversal exposed via `searchDirectories()` + recent-project rows.
 *  - Pure path-string helpers re-exported for the View to render with.
 *
 * Must be invoked inside a component / hook reactive setup scope (it calls
 * context hooks and reactive primitives).
 *
 * The module imports Model (@/context/*) and SDK only. It MUST NOT import View
 * components, @/bs/*, or @/vendor/ui (no DOM / markup).
 */

export const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"];

// ---------------------------------------------------------------------------
// Pure path-string helpers (no reactivity, no SDK). Used by both the directory
// traversal logic and the View for display formatting.
// ---------------------------------------------------------------------------

/**
 * Sanitize a raw input string into a single clean line: keep only the first
 * line and strip control characters, then trim.
 * @param {string} value - The raw input value.
 * @returns {string} The cleaned single-line string.
 */
export function cleanInput(value) {
  const first = (value ?? "").split(/\r?\n/)[0] ?? "";
  return first.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/**
 * Normalize path separators to "/" and collapse repeated slashes, preserving a
 * leading "//" (UNC-style) prefix.
 * @param {string} input - The path to normalize.
 * @returns {string} The normalized path.
 */
function normalizePath(input) {
  const v = input.replaceAll("\\", "/");
  if (v.startsWith("//") && !v.startsWith("///")) return "//" + v.slice(2).replace(/\/+/g, "/");
  return v.replace(/\/+/g, "/");
}

/**
 * Normalize a path and append a trailing slash to a bare Windows drive (e.g. "C:" to "C:/").
 * @param {string} input - The path to normalize.
 * @returns {string} The normalized path with drive root made explicit.
 */
function normalizeDriveRoot(input) {
  const v = normalizePath(input);
  if (/^[A-Za-z]:$/.test(v)) return v + "/";
  return v;
}

/**
 * Strip trailing slashes from a path, but keep root forms ("/", "//", "C:/") intact.
 * @param {string} input - The path to trim.
 * @returns {string} The path without a trailing slash (unless it is a root).
 */
function trimTrailing(input) {
  const v = normalizeDriveRoot(input);
  if (v === "/") return v;
  if (v === "//") return v;
  if (/^[A-Za-z]:\/$/.test(v)) return v;
  return v.replace(/\/+$/, "");
}

/**
 * Join a base path and a relative path with a single "/" separator.
 * @param {string} base - The base path.
 * @param {string} rel - The relative path to append.
 * @returns {string} The joined path.
 */
function joinPath(base, rel) {
  const b = trimTrailing(base ?? "");
  const r = trimTrailing(rel).replace(/^\/+/, "");
  if (!b) return r;
  if (!r) return b;
  if (b.endsWith("/")) return b + r;
  return b + "/" + r;
}

/**
 * Determine the filesystem root prefix of a path ("//", "/", a drive root like
 * "C:/", or "" for relative paths).
 * @param {string} input - The path to inspect.
 * @returns {string} The root prefix, or "" if the path is relative.
 */
function rootOf(input) {
  const v = normalizeDriveRoot(input);
  if (v.startsWith("//")) return "//";
  if (v.startsWith("/")) return "/";
  if (/^[A-Za-z]:\//.test(v)) return v.slice(0, 3);
  return "";
}

/**
 * Compute the parent directory of a path, stopping at root forms.
 * @param {string} input - The path whose parent is wanted.
 * @returns {string} The parent path (or the root if already at root).
 */
function parentOf(input) {
  const v = trimTrailing(input);
  if (v === "/") return v;
  if (v === "//") return v;
  if (/^[A-Za-z]:\/$/.test(v)) return v;
  const i = v.lastIndexOf("/");
  if (i <= 0) return "/";
  if (i === 2 && /^[A-Za-z]:/.test(v)) return v.slice(0, 3);
  return v.slice(0, i);
}

/**
 * Classify how a user-typed path should be interpreted.
 * @param {string} input - The raw path input.
 * @returns {string} "tilde" (home-relative), "absolute", or "relative".
 */
function modeOf(input) {
  const raw = normalizeDriveRoot(input.trim());
  if (!raw) return "relative";
  if (raw.startsWith("~")) return "tilde";
  if (rootOf(raw)) return "absolute";
  return "relative";
}

/**
 * Express an absolute path relative to the home directory using "~", when it is
 * inside home; otherwise return "".
 * @param {string} absolute - The absolute path.
 * @param {string} home - The home directory.
 * @returns {string} The "~"-prefixed path, or "" when not under home.
 */
function tildeOf(absolute, home) {
  const full = trimTrailing(absolute);
  if (!home) return "";
  const hn = trimTrailing(home);
  const lc = full.toLowerCase();
  const hc = hn.toLowerCase();
  if (lc === hc) return "~";
  if (lc.startsWith(hc + "/")) return "~" + full.slice(hn.length);
  return "";
}

/**
 * Choose how to display a resolved path to the user: full absolute when the user
 * typed an absolute path, otherwise prefer the "~"-relative form.
 * @param {string} path - The resolved absolute path.
 * @param {string} input - The raw user input (drives mode detection).
 * @param {string} home - The home directory.
 * @returns {string} The display string.
 */
export function displayPath(path, input, home) {
  const full = trimTrailing(path);
  if (modeOf(input) === "absolute") return full;
  return tildeOf(full, home) || full;
}

/**
 * Build a directory list row with a newline-joined searchable string (covering
 * the absolute path, its "~" form, slash variants and the filename).
 * @param {string} absolute - The absolute directory path.
 * @param {string} home - The home directory (for the "~" form).
 * @param {string} group - The row's group/category label.
 * @returns {Object} A row with `absolute`, `search`, and `group`.
 */
function toRow(absolute, home, group) {
  const full = trimTrailing(absolute);
  const tilde = tildeOf(full, home);
  const withSlash = value => {
    if (!value) return "";
    if (value.endsWith("/")) return value;
    return value + "/";
  };
  const search = Array.from(new Set([full, withSlash(full), tilde, withSlash(tilde), getFilename(full)].filter(Boolean))).join("\n");
  return {
    absolute: full,
    search,
    group,
  };
}

/**
 * De-duplicate directory rows by their absolute path, preserving first occurrence.
 * @param {Array} rows - The rows to filter (each with an `absolute`).
 * @returns {Array} The unique rows.
 */
function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.absolute)) return false;
    seen.add(row.absolute);
    return true;
  });
}

/**
 * SDK-backed directory traversal/search. `args.sdk` is the global SDK; `home`
 * and `start` are accessors resolving the active home / base directory. Returns
 * an async search function that takes a filter string and resolves to a list of
 * absolute directory paths (capped at 50), de-duplicated; stale calls (a newer
 * search started) resolve to an empty list.
 * @param {Object} args - Has `sdk` (global SDK) and `home`/`start` accessor functions.
 * @returns {Function} An async `(filter)` function resolving to matched directory paths.
 */
function createDirectorySearch(args) {
  const cache = new Map();
  let current = 0;
  const scoped = value => {
    const base = args.start();
    if (!base) return;
    const raw = normalizeDriveRoot(value);
    if (!raw) return {
      directory: trimTrailing(base),
      path: "",
    };
    const h = args.home();
    if (raw === "~") return {
      directory: trimTrailing(h || base),
      path: "",
    };
    if (raw.startsWith("~/")) return {
      directory: trimTrailing(h || base),
      path: raw.slice(2),
    };
    const root = rootOf(raw);
    if (root) return {
      directory: trimTrailing(root),
      path: raw.slice(root.length),
    };
    return {
      directory: trimTrailing(base),
      path: raw,
    };
  };
  const dirs = async dir => {
    const key = trimTrailing(dir);
    const existing = cache.get(key);
    if (existing) return existing;
    const request = args.sdk.client.file.list({
      directory: key,
      path: "",
    }).then(x => x.data ?? []).catch(() => []).then(nodes => nodes.filter(n => n.type === "directory").map(n => ({
      name: n.name,
      absolute: trimTrailing(normalizeDriveRoot(n.absolute)),
    })));
    cache.set(key, request);
    return request;
  };
  const match = async (dir, query, limit) => {
    const items = await dirs(dir);
    if (!query) return items.slice(0, limit).map(x => x.absolute);
    return fuzzysort.go(query, items, {
      key: "name",
      limit,
    }).map(x => x.obj.absolute);
  };
  return async filter => {
    const token = ++current;
    const active = () => token === current;
    const value = cleanInput(filter);
    const scopedInput = scoped(value);
    if (!scopedInput) return [];
    const raw = normalizeDriveRoot(value);
    const isPath = raw.startsWith("~") || !!rootOf(raw) || raw.includes("/");
    const query = normalizeDriveRoot(scopedInput.path);
    const find = () => args.sdk.client.find.files({
      directory: scopedInput.directory,
      query,
      type: "directory",
      limit: 50,
    }).then(x => x.data ?? []).catch(() => []);
    if (!isPath) {
      const results = await find();
      if (!active()) return [];
      return results.map(rel => joinPath(scopedInput.directory, rel)).slice(0, 50);
    }
    const segments = query.replace(/^\/+/, "").split("/");
    const head = segments.slice(0, segments.length - 1).filter(x => x && x !== ".");
    const tail = segments[segments.length - 1] ?? "";
    const cap = 12;
    const branch = 4;
    let paths = [scopedInput.directory];
    for (const part of head) {
      if (!active()) return [];
      if (part === "..") {
        paths = paths.map(parentOf);
        continue;
      }
      const next = (await Promise.all(paths.map(p => match(p, part, branch)))).flat();
      if (!active()) return [];
      paths = Array.from(new Set(next)).slice(0, cap);
      if (paths.length === 0) return [];
    }
    const out = (await Promise.all(paths.map(p => match(p, tail, 50)))).flat();
    if (!active()) return [];
    const deduped = Array.from(new Set(out));
    const base = raw.startsWith("~") ? trimTrailing(scopedInput.directory) : "";
    const expand = !raw.endsWith("/");
    if (!expand || !tail) {
      const items = base ? Array.from(new Set([base, ...deduped])) : deduped;
      return items.slice(0, 50);
    }
    const needle = tail.toLowerCase();
    const exact = deduped.filter(p => getFilename(p).toLowerCase() === needle);
    const target = exact[0];
    if (!target) return deduped.slice(0, 50);
    const children = await match(target, "", 30);
    if (!active()) return [];
    const items = Array.from(new Set([...deduped, ...children]));
    return (base ? Array.from(new Set([base, ...items])) : items).slice(0, 50);
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.project] - The project being edited (for saveProject).
 * @param {() => void} [options.onSaved] - Called after a successful save.
 */
export const useProjectController = (options = {}) => {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const layout = useLayout();

  // -------------------------------------------------------------------------
  // Project metadata persistence (dialog-edit-project)
  // -------------------------------------------------------------------------

  // Action: persist edited project metadata. `input` carries the trimmed/derived
  // form values from the View. Returns a promise (the View drives pending state
  // via its own mutation wrapper).
  /**
   * Persist edited project metadata. Updates a real project via the SDK (and
   * syncs its icon), or writes meta locally for the unsaved/global project. Calls
   * `options.onSaved` afterwards.
   * @param {Object} input - The form values: `name`, `startup`, `color`, `iconOverride`.
   * @returns {Promise} Resolves once the save completes.
   */
  const saveProject = async input => {
    const project = options.project;
    const name = input.name;
    const start = input.startup;
    const color = input.color || "";
    const override = input.iconOverride || "";
    if (project?.id && project.id !== "global") {
      await globalSDK.client.project.update({
        projectID: project.id,
        directory: project.worktree,
        name,
        icon: {
          color,
          override,
        },
        commands: {
          start,
        },
      });
      globalSync.project.icon(project.worktree, override || undefined);
      options.onSaved?.();
      return;
    }
    globalSync.project.meta(project.worktree, {
      name,
      icon: {
        color: color || undefined,
        override: override || undefined,
      },
      commands: {
        start: start || undefined,
      },
    });
    options.onSaved?.();
  };

  // -------------------------------------------------------------------------
  // Directory browse / search (dialog-select-directory)
  // -------------------------------------------------------------------------

  // Lazy SDK fallback for the base/home path when global-sync has not surfaced
  // it yet. Never throws into the View.
  const missingBase = createMemo(() => !(globalSync.data?.path.home || globalSync.data?.path.directory));
  const [fallbackPath] = createResource(
    () => missingBase() ? true : undefined,
    async () => globalSDK.client.path.get().then(x => x.data).catch(() => undefined),
    { initialValue: undefined },
  );

  const home = createMemo(() => globalSync.data?.path.home || fallbackPath()?.home || "");
  const start = createMemo(
    () => globalSync.data?.path.home || globalSync.data?.path.directory || fallbackPath()?.home || fallbackPath()?.directory,
  );

  const directories = createDirectorySearch({
    sdk: globalSDK,
    home,
    start,
  });

  // Derived Model state: up-to-5 most-recently-active projects as list rows.
  /**
   * Memo: the up-to-5 most-recently-active projects as directory list rows,
   * ranked by their most recent non-archived session update time.
   * @returns {Array} The recent-project rows (each from toRow, with name appended to search).
   */
  const recentProjects = createMemo(() => {
    const projects = layout.projects.list();
    const byProject = new Map();
    for (const project of projects) {
      let at = 0;
      const dirs = [project.worktree, ...(project.sandboxes ?? [])];
      for (const directory of dirs) {
        const sessions = globalSync.child(directory, {
          bootstrap: false,
        })[0].session;
        for (const session of sessions) {
          if (session.time.archived) continue;
          const updated = session.time.updated ?? session.time.created;
          if (updated > at) at = updated;
        }
      }
      byProject.set(project.worktree, at);
    }
    return projects.map((project, index) => ({
      project,
      at: byProject.get(project.worktree) ?? 0,
      index,
    })).sort((a, b) => b.at - a.at || a.index - b.index).slice(0, 5).map(({ project }) => {
      const row = toRow(project.worktree, home(), "recent");
      const name = project.name || getFilename(project.worktree);
      return {
        ...row,
        search: `${row.search}\n${name}`,
      };
    });
  });

  // Action: produce list rows (recent projects + matched directories) for a
  // given filter value. Used as the List `items` loader by the View.
  /**
   * Produce list rows (recent projects + matched directories) for a given filter
   * value, de-duplicated. Used as the List `items` loader by the View.
   * @param {string} value - The filter/search string.
   * @returns {Promise<Array>} The combined, de-duplicated directory rows.
   */
  const searchDirectories = async value => {
    const results = await directories(value);
    const directoryRows = results.map(absolute => toRow(absolute, home(), "folders"));
    return uniqueRows([...recentProjects(), ...directoryRows]);
  };

  return {
    // Static config
    AVATAR_COLOR_KEYS,
    // Derived state accessors
    home,
    start,
    recentProjects,
    // Actions
    saveProject,
    searchDirectories,
  };
};
