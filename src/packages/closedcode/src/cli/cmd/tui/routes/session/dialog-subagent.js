import { createComponent as _$createComponent } from "@opentui/solid";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { useRoute } from "@tui/context/route.js";
export function DialogSubagent(props) {
  const route = useRoute();
  return _$createComponent(DialogSelect, {
    title: "Subagent Actions",
    options: [{
      title: "Open",
      value: "subagent.view",
      description: "the subagent's session",
      onSelect: dialog => {
        route.navigate({
          type: "session",
          sessionID: props.sessionID
        });
        dialog.clear();
      }
    }]
  });
}