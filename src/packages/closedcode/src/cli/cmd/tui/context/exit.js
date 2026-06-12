import { useRenderer } from "@opentui/solid";
import { createSimpleContext } from "./helper.js";
import { FormatError, FormatUnknownError } from "#cli/error.js";
import { win32FlushInputBuffer } from "../win32.js";
export const {
  use: useExit,
  provider: ExitProvider
} = createSimpleContext({
  name: "Exit",
  init: input => {
    const renderer = useRenderer();
    let message;
    let task;
    const store = {
      set: value => {
        const prev = message;
        message = value;
        return () => {
          message = prev;
        };
      },
      clear: () => {
        message = undefined;
      },
      get: () => message
    };
    const exit = Object.assign(reason => {
      if (task) return task;
      task = (async () => {
        await input.onBeforeExit?.();
        // Reset window title before destroying renderer
        renderer.setTerminalTitle("");
        renderer.destroy();
        win32FlushInputBuffer();
        if (reason) {
          const formatted = FormatError(reason) ?? FormatUnknownError(reason);
          if (formatted) {
            process.stderr.write(formatted + "\n");
          }
        }
        const text = store.get();
        if (text) process.stdout.write(text + "\n");
        await input.onExit?.();
      })();
      return task;
    }, {
      message: store
    });
    process.on("SIGHUP", () => exit());
    return exit;
  }
});