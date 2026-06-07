import { useProject } from "./project.js";
import { useSDK } from "./sdk.js";
export function useEvent() {
  const project = useProject();
  const sdk = useSDK();
  function subscribe(handler) {
    return sdk.event.on("event", event => {
      if (event.payload.type === "sync") {
        return;
      }

      // Special hack for truly global events
      if (event.directory === "global") {
        handler(event.payload);
      }
      if (project.workspace.current()) {
        if (event.workspace === project.workspace.current()) {
          handler(event.payload);
        }
        return;
      }
      if (event.directory === project.instance.directory()) {
        handler(event.payload);
      }
    });
  }
  function on(type, handler) {
    return subscribe(event => {
      if (event.type !== type) return;
      handler(event);
    });
  }
  return {
    subscribe,
    on
  };
}