import { createComponent as _$createComponent } from "@opentui/solid";
import { createMemo } from "solid-js";
import { useLocal } from "@tui/context/local.js";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { useDialog } from "@tui/ui/dialog.js";
export function DialogVariant() {
  const local = useLocal();
  const dialog = useDialog();
  const options = createMemo(() => {
    return [{
      value: "default",
      title: "Default",
      onSelect: () => {
        dialog.clear();
        local.model.variant.set(undefined);
      }
    }, ...local.model.variant.list().map(variant => ({
      value: variant,
      title: variant,
      onSelect: () => {
        dialog.clear();
        local.model.variant.set(variant);
      }
    }))];
  });
  return _$createComponent(DialogSelect, {
    get options() {
      return options();
    },
    title: "Select variant",
    get current() {
      return local.model.variant.selected();
    },
    flat: true
  });
}