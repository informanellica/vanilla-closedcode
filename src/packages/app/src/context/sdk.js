/** @file SDK context: a directory-scoped view over the global SDK, exposing a client bound to the current directory plus an event emitter for that directory's events. */
import { createSimpleContext } from "@/lib/context.js";
import { createGlobalEmitter } from "../lib/primitives/event-bus.js";
import { createEffect, createMemo, onCleanup } from "../lib/reactivity.js";
import { useGlobalSDK } from "./global-sdk.js";
/**
 * Directory-scoped SDK context. Provider props supply `directory` (a reactive accessor for the
 * active directory); the context derives a client bound to that directory and forwards the
 * directory's events through a per-context emitter.
 * Exposes: `directory` (current directory), `client` (directory-bound SDK client), `event`
 * (emitter of that directory's events), `url` (server URL), and `createClient(opts)` to build
 * an ad-hoc client.
 */
export const {
  use: useSDK,
  provider: SDKProvider
} = createSimpleContext({
  name: "SDK",
  init: props => {
    const globalSDK = useGlobalSDK();
    const directory = createMemo(props.directory);
    const client = createMemo(() => globalSDK.createClient({
      directory: directory(),
      throwOnError: true
    }));
    const emitter = createGlobalEmitter();
    createEffect(() => {
      const unsub = globalSDK.event.on(directory(), event => {
        emitter.emit(event.type, event);
      });
      onCleanup(unsub);
    });
    return {
      get directory() {
        return directory();
      },
      get client() {
        return client();
      },
      event: emitter,
      get url() {
        return globalSDK.url;
      },
      createClient(opts) {
        return globalSDK.createClient(opts);
      }
    };
  }
});