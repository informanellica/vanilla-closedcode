import { createComponent as _$createComponent } from "@opentui/solid";
import { createMemo, onMount } from "solid-js";
import { useSync } from "@tui/context/sync.js";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { Locale } from "@/util/locale.js";
import { DialogMessage } from "./dialog-message.js";
import { useDialog } from "../../ui/dialog.js";
export function DialogTimeline(props) {
  const sync = useSync();
  const dialog = useDialog();
  onMount(() => {
    dialog.setSize("large");
  });
  const options = createMemo(() => {
    const messages = sync.data.message[props.sessionID] ?? [];
    const result = [];
    for (const message of messages) {
      if (message.role !== "user") continue;
      const part = (sync.data.part[message.id] ?? []).find(x => x.type === "text" && !x.synthetic && !x.ignored);
      if (!part) continue;
      result.push({
        title: part.text.replace(/\n/g, " "),
        value: message.id,
        footer: Locale.time(message.time.created),
        onSelect: dialog => {
          dialog.replace(() => _$createComponent(DialogMessage, {
            get messageID() {
              return message.id;
            },
            get sessionID() {
              return props.sessionID;
            },
            get setPrompt() {
              return props.setPrompt;
            }
          }));
        }
      });
    }
    result.reverse();
    return result;
  });
  return _$createComponent(DialogSelect, {
    onMove: option => props.onMove(option.value),
    title: "Timeline",
    get options() {
      return options();
    }
  });
}