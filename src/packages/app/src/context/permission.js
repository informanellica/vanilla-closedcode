import { createEffect, createMemo, onCleanup } from "../lib/reactivity.js";
import { createStore, produce } from "../lib/store.js";
import { createSimpleContext } from "@/lib/context.js";
import { Persist, persisted } from "@/utils/persist.js";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "./global-sync.js";
import { useParams } from "../lib/router/index.js";
import { decode64 } from "@/utils/base64.js";
import { acceptKey, directoryAcceptKey, isDirectoryAutoAccepting, autoRespondsPermission } from "./permission-auto-respond.js";
/** @file Permission context: manages the persisted auto-accept store, auto-responds to permission requests for auto-accepting sessions/directories, and exposes toggles plus config-derived state. */
/**
 * Whether a permission rule resolves to something other than "allow" (so it would prompt).
 * Accepts a string action or a record of per-action strings.
 * @param {*} rule - A rule value (string, record of actions, or other).
 * @returns {boolean} True when the rule is not a pure "allow".
 */
function isNonAllowRule(rule) {
  if (!rule) return false;
  if (typeof rule === "string") return rule !== "allow";
  if (typeof rule !== "object") return false;
  if (Array.isArray(rule)) return false;
  for (const action of Object.values(rule)) {
    if (action !== "allow") return true;
  }
  return false;
}
/**
 * Whether a config's permission setting would ever produce a prompt (i.e. has a non-allow rule).
 * @param {*} permission - The config permission value (string, record of rules, or other).
 * @returns {boolean} True when at least one rule is not "allow".
 */
function hasPermissionPromptRules(permission) {
  if (!permission) return false;
  if (typeof permission === "string") return permission !== "allow";
  if (typeof permission !== "object") return false;
  if (Array.isArray(permission)) return false;
  const config = permission;
  return Object.values(config).some(isNonAllowRule);
}
/**
 * Permission context. Persists per-session and per-directory auto-accept flags, listens for
 * `permission.asked` events and auto-responds ("once") when the session/directory is auto-accepting,
 * and reconciles directory config (`permission: "allow"`) into the auto-accept store.
 * Exposes: `ready`, `respond(input)`, `autoResponds(permission, directory)`, `isAutoAccepting`,
 * `isAutoAcceptingDirectory`, toggles/setters (`toggleAutoAccept`, `toggleAutoAcceptDirectory`,
 * `enableAutoAccept`, `disableAutoAccept`), `permissionsEnabled`, and `isPermissionAllowAll`.
 */
export const {
  use: usePermission,
  provider: PermissionProvider
} = createSimpleContext({
  name: "Permission",
  init: () => {
    const params = useParams();
    const globalSDK = useGlobalSDK();
    const globalSync = useGlobalSync();
    const permissionsEnabled = createMemo(() => {
      const directory = decode64(params.dir);
      if (!directory) return false;
      const [store] = globalSync.child(directory);
      return hasPermissionPromptRules(store.config.permission);
    });
    const [store, setStore, _, ready] = persisted({
      ...Persist.global("permission", ["permission.v3"]),
      migrate(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        const data = value;
        if (data.autoAccept) return value;
        return {
          ...data,
          autoAccept: typeof data.autoAcceptEdits === "object" && data.autoAcceptEdits && !Array.isArray(data.autoAcceptEdits) ? data.autoAcceptEdits : {}
        };
      }
    }, createStore({
      autoAccept: {}
    }));

    // When config has permission: "allow", auto-enable directory-level auto-accept
    createEffect(() => {
      if (!ready()) return;
      const directory = decode64(params.dir);
      if (!directory) return;
      const [childStore] = globalSync.child(directory);
      const perm = childStore.config.permission;
      if (typeof perm === "string" && perm === "allow") {
        const key = directoryAcceptKey(directory);
        if (store.autoAccept[key] === undefined) {
          setStore(produce(draft => {
            draft.autoAccept[key] = true;
          }));
        }
      }
    });
    const MAX_RESPONDED = 1000;
    const RESPONDED_TTL_MS = 60 * 60 * 1000;
    const responded = new Map();
    const enableVersion = new Map();
    /**
     * Evicts expired and overflow entries from the responded-permissions map.
     * @param {number} now - The current timestamp (ms).
     */
    function pruneResponded(now) {
      for (const [id, ts] of responded) {
        if (now - ts < RESPONDED_TTL_MS) break;
        responded.delete(id);
      }
      for (const id of responded.keys()) {
        if (responded.size <= MAX_RESPONDED) break;
        responded.delete(id);
      }
    }
    // Send a permission response via the SDK, clearing the responded marker on failure so it can be retried.
    const respond = input => {
      globalSDK.client.permission.respond(input).catch(() => {
        responded.delete(input.permissionID);
      });
    };
    /**
     * Responds "once" to a permission, de-duplicating so the same permission is answered at most once.
     * @param {Object} permission - The permission request ({id, sessionID}).
     * @param {string} directory - The directory the permission belongs to (optional).
     */
    function respondOnce(permission, directory) {
      const now = Date.now();
      const hit = responded.has(permission.id);
      responded.delete(permission.id);
      responded.set(permission.id, now);
      pruneResponded(now);
      if (hit) return;
      respond({
        sessionID: permission.sessionID,
        permissionID: permission.id,
        response: "once",
        directory
      });
    }
    /**
     * Whether a session (considering its lineage) is currently auto-accepting permissions.
     * @param {string} sessionID - The session id.
     * @param {string} directory - The directory the session belongs to (optional).
     * @returns {boolean} True when the session auto-accepts.
     */
    function isAutoAccepting(sessionID, directory) {
      const session = directory ? globalSync.child(directory, {
        bootstrap: false
      })[0].session : [];
      return autoRespondsPermission(store.autoAccept, session, {
        sessionID
      }, directory);
    }
    /**
     * Whether a directory is currently auto-accepting all of its sessions' permissions.
     * @param {string} directory - The directory.
     * @returns {boolean} True when directory-wide auto-accept is enabled.
     */
    function isAutoAcceptingDirectory(directory) {
      return isDirectoryAutoAccepting(store.autoAccept, directory);
    }
    /**
     * Whether a specific permission request should be auto-responded to (per session lineage and directory rules).
     * @param {Object} permission - The permission request ({sessionID, ...}).
     * @param {string} directory - The directory the permission belongs to (optional).
     * @returns {boolean} True when the request should be auto-accepted.
     */
    function shouldAutoRespond(permission, directory) {
      const session = directory ? globalSync.child(directory, {
        bootstrap: false
      })[0].session : [];
      return autoRespondsPermission(store.autoAccept, session, permission, directory);
    }
    /**
     * Increments and returns a per-key version used to discard stale async enable/disable results.
     * @param {string} sessionID - The session id.
     * @param {string} directory - The directory the session belongs to (optional).
     * @returns {number} The new version number for the key.
     */
    function bumpEnableVersion(sessionID, directory) {
      const key = acceptKey(sessionID, directory);
      const next = (enableVersion.get(key) ?? 0) + 1;
      enableVersion.set(key, next);
      return next;
    }
    const unsubscribe = globalSDK.event.listen(e => {
      const event = e.details;
      if (event?.type !== "permission.asked") return;
      const perm = event.properties;
      if (!shouldAutoRespond(perm, e.name)) return;
      respondOnce(perm, e.name);
    });
    onCleanup(unsubscribe);
    /**
     * Enables directory-wide auto-accept and auto-responds to any already-pending permissions in that directory.
     * @param {string} directory - The directory.
     */
    function enableDirectory(directory) {
      const key = directoryAcceptKey(directory);
      setStore(produce(draft => {
        draft.autoAccept[key] = true;
      }));
      globalSDK.client.permission.list({
        directory
      }).then(x => {
        if (!isAutoAcceptingDirectory(directory)) return;
        for (const perm of x.data ?? []) {
          if (!perm?.id) continue;
          if (!shouldAutoRespond(perm, directory)) continue;
          respondOnce(perm, directory);
        }
      }).catch(() => undefined);
    }
    /**
     * Disables directory-wide auto-accept.
     * @param {string} directory - The directory.
     */
    function disableDirectory(directory) {
      const key = directoryAcceptKey(directory);
      setStore(produce(draft => {
        draft.autoAccept[key] = false;
      }));
    }
    /**
     * Enables auto-accept for a session and auto-responds to that session's already-pending permissions.
     * Uses the enable-version to ignore the async result if the toggle changed meanwhile.
     * @param {string} sessionID - The session id.
     * @param {string} directory - The directory the session belongs to (optional).
     */
    function enable(sessionID, directory) {
      const key = acceptKey(sessionID, directory);
      const version = bumpEnableVersion(sessionID, directory);
      setStore(produce(draft => {
        draft.autoAccept[key] = true;
        delete draft.autoAccept[sessionID];
      }));
      globalSDK.client.permission.list({
        directory
      }).then(x => {
        if (enableVersion.get(key) !== version) return;
        if (!isAutoAccepting(sessionID, directory)) return;
        for (const perm of x.data ?? []) {
          if (!perm?.id) continue;
          if (!shouldAutoRespond(perm, directory)) continue;
          respondOnce(perm, directory);
        }
      }).catch(() => undefined);
    }
    /**
     * Disables auto-accept for a session (and invalidates any in-flight enable).
     * @param {string} sessionID - The session id.
     * @param {string} directory - The directory the session belongs to (optional).
     */
    function disable(sessionID, directory) {
      bumpEnableVersion(sessionID, directory);
      const key = directory ? acceptKey(sessionID, directory) : sessionID;
      setStore(produce(draft => {
        draft.autoAccept[key] = false;
        if (!directory) return;
        delete draft.autoAccept[sessionID];
      }));
    }
    return {
      ready,
      respond,
      autoResponds(permission, directory) {
        return shouldAutoRespond(permission, directory);
      },
      isAutoAccepting,
      isAutoAcceptingDirectory,
      toggleAutoAccept(sessionID, directory) {
        if (isAutoAccepting(sessionID, directory)) {
          disable(sessionID, directory);
          return;
        }
        enable(sessionID, directory);
      },
      toggleAutoAcceptDirectory(directory) {
        if (isAutoAcceptingDirectory(directory)) {
          disableDirectory(directory);
          return;
        }
        enableDirectory(directory);
      },
      enableAutoAccept(sessionID, directory) {
        if (isAutoAccepting(sessionID, directory)) return;
        enable(sessionID, directory);
      },
      disableAutoAccept(sessionID, directory) {
        disable(sessionID, directory);
      },
      permissionsEnabled,
      isPermissionAllowAll(directory) {
        const [childStore] = globalSync.child(directory);
        const perm = childStore.config.permission;
        return typeof perm === "string" && perm === "allow";
      }
    };
  }
});