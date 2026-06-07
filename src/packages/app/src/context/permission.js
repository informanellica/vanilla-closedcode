import { createEffect, createMemo, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { createSimpleContext } from "@/lib/context.js";
import { Persist, persisted } from "@/utils/persist.js";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "./global-sync.js";
import { useParams } from "@solidjs/router";
import { decode64 } from "@/utils/base64.js";
import { acceptKey, directoryAcceptKey, isDirectoryAutoAccepting, autoRespondsPermission } from "./permission-auto-respond.js";
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
function hasPermissionPromptRules(permission) {
  if (!permission) return false;
  if (typeof permission === "string") return permission !== "allow";
  if (typeof permission !== "object") return false;
  if (Array.isArray(permission)) return false;
  const config = permission;
  return Object.values(config).some(isNonAllowRule);
}
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
    const respond = input => {
      globalSDK.client.permission.respond(input).catch(() => {
        responded.delete(input.permissionID);
      });
    };
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
    function isAutoAccepting(sessionID, directory) {
      const session = directory ? globalSync.child(directory, {
        bootstrap: false
      })[0].session : [];
      return autoRespondsPermission(store.autoAccept, session, {
        sessionID
      }, directory);
    }
    function isAutoAcceptingDirectory(directory) {
      return isDirectoryAutoAccepting(store.autoAccept, directory);
    }
    function shouldAutoRespond(permission, directory) {
      const session = directory ? globalSync.child(directory, {
        bootstrap: false
      })[0].session : [];
      return autoRespondsPermission(store.autoAccept, session, permission, directory);
    }
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
    function disableDirectory(directory) {
      const key = directoryAcceptKey(directory);
      setStore(produce(draft => {
        draft.autoAccept[key] = false;
      }));
    }
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