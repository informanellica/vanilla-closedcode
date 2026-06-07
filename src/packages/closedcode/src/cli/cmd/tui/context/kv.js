import { Global } from "core/global";
import { Filesystem } from "@/util/filesystem.js";
import { Flock } from "core/util/flock";
import { rename, rm } from "fs/promises";
import { createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { createSimpleContext } from "./helper.js";
import path from "path";
export const {
  use: useKV,
  provider: KVProvider
} = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false);
    const [store, setStore] = createStore();
    const filePath = path.join(Global.Path.state, "kv.json");
    const lock = `tui-kv:${filePath}`;
    // Queue same-process writes so rapid updates persist in order.
    let write = Promise.resolve();

    // Write to a temp file first so kv.json is only replaced once the JSON is complete, avoiding partial writes if shutdown interrupts persistence.
    function writeSnapshot(snapshot) {
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      return Filesystem.writeJson(tempPath, snapshot).then(() => rename(tempPath, filePath)).catch(async error => {
        await rm(tempPath, {
          force: true
        }).catch(() => undefined);
        throw error;
      });
    }

    // Read under the same lock used for writes because kv.json is shared across processes.
    Flock.withLock(lock, () => Filesystem.readJson(filePath)).then(x => {
      setStore(x);
    }).catch(error => {
      console.error("Failed to read KV state", {
        filePath,
        error
      });
    }).finally(() => {
      setReady(true);
    });
    const result = {
      get ready() {
        return ready();
      },
      get store() {
        return store;
      },
      signal(name, defaultValue) {
        if (store[name] === undefined) setStore(name, defaultValue);
        return [function () {
          return result.get(name);
        }, function setter(next) {
          result.set(name, next);
        }];
      },
      get(key, defaultValue) {
        return store[key] ?? defaultValue;
      },
      set(key, value) {
        setStore(key, value);
        const snapshot = structuredClone(unwrap(store));
        write = write.then(() => Flock.withLock(lock, () => writeSnapshot(snapshot))).catch(error => {
          console.error("Failed to write KV state", {
            filePath,
            error
          });
        });
      }
    };
    return result;
  }
});