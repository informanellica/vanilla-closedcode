import { createSimpleContext } from "@/lib/context.js";
import { createGlobalEmitter } from "../lib/primitives/event-bus.js";
import { createEffect, createMemo, onCleanup } from "solid-js";
import { useGlobalSDK } from "./global-sdk.js";
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