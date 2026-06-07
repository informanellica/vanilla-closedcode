import { createComponent as _$createComponent } from "@opentui/solid";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { createResource, createMemo } from "solid-js";
import { useDialog } from "@tui/ui/dialog.js";
import { useSDK } from "@tui/context/sdk.js";
export function DialogSkill(props) {
  const dialog = useDialog();
  const sdk = useSDK();
  dialog.setSize("large");
  const [skills] = createResource(async () => {
    const result = await sdk.client.app.skills();
    return result.data ?? [];
  });
  const options = createMemo(() => {
    const list = skills() ?? [];
    const maxWidth = Math.max(0, ...list.map(s => s.name.length));
    return list.map(skill => ({
      title: skill.name.padEnd(maxWidth),
      description: skill.description?.replace(/\s+/g, " ").trim(),
      value: skill.name,
      category: "Skills",
      onSelect: () => {
        props.onSelect(skill.name);
        dialog.clear();
      }
    }));
  });
  return _$createComponent(DialogSelect, {
    title: "Skills",
    placeholder: "Search skills...",
    get options() {
      return options();
    }
  });
}