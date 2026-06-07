import { createComponent as _$createComponent } from "@opentui/solid";
import { DialogPrompt } from "@tui/ui/dialog-prompt.js";
import { useDialog } from "@tui/ui/dialog.js";
import { useSync } from "@tui/context/sync.js";
import { createMemo } from "solid-js";
import { useSDK } from "../context/sdk.js";
export function DialogSessionRename(props) {
  const dialog = useDialog();
  const sync = useSync();
  const sdk = useSDK();
  const session = createMemo(() => sync.session.get(props.session));
  return _$createComponent(DialogPrompt, {
    title: "Rename Session",
    get value() {
      return session()?.title;
    },
    onConfirm: value => {
      void sdk.client.session.update({
        sessionID: props.session,
        title: value
      });
      dialog.clear();
    },
    onCancel: () => dialog.clear()
  });
}