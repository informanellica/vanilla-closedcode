import { createComponent as _$createComponent } from "@opentui/solid";
import { createMemo } from "solid-js";
import { useLocal } from "#tui/context/local.js";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { useDialog } from "#tui/ui/dialog.js";
export function DialogAgent() {
  const local = useLocal();
  const dialog = useDialog();
  const options = createMemo(() => local.agent.list().map(item => {
    return {
      value: item.name,
      title: item.name,
      description: item.native ? "native" : item.description
    };
  }));
  return _$createComponent(DialogSelect, {
    title: "Select agent",
    get current() {
      return local.agent.current()?.name;
    },
    get options() {
      return options();
    },
    onSelect: option => {
      local.agent.set(option.value);
      dialog.clear();
    }
  });
}