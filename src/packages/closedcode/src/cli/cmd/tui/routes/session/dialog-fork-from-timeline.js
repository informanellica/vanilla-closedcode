import { createComponent as _$createComponent } from "@opentui/solid";
import { createMemo, onMount } from "solid-js";
import { useSync } from "#tui/context/sync.js";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { Locale } from "#util/locale.js";
import { useSDK } from "#tui/context/sdk.js";
import { useRoute } from "#tui/context/route.js";
import { useDialog } from "../../ui/dialog.js";
import { strip } from "#tui/component/prompt/part.js";
export function DialogForkFromTimeline(props) {
  const sync = useSync();
  const dialog = useDialog();
  const sdk = useSDK();
  const route = useRoute();
  onMount(() => {
    dialog.setSize("large");
  });
  const options = createMemo(() => {
    const messages = sync.data.message[props.sessionID] ?? [];
    const fullSession = {
      title: "Full session",
      value: undefined,
      onSelect: async dialog => {
        const forked = await sdk.client.session.fork({
          sessionID: props.sessionID
        });
        route.navigate({
          sessionID: forked.data.id,
          type: "session"
        });
        dialog.clear();
      }
    };
    const result = [];
    for (const message of messages) {
      if (message.role !== "user") continue;
      const part = (sync.data.part[message.id] ?? []).find(x => x.type === "text" && !x.synthetic && !x.ignored);
      if (!part) continue;
      result.push({
        title: part.text.replace(/\n/g, " "),
        value: message.id,
        footer: Locale.time(message.time.created),
        onSelect: async dialog => {
          const forked = await sdk.client.session.fork({
            sessionID: props.sessionID,
            messageID: message.id
          });
          const parts = sync.data.part[message.id] ?? [];
          const prompt = parts.reduce((agg, part) => {
            if (part.type === "text") {
              if (!part.synthetic) agg.input += part.text;
            }
            if (part.type === "file") agg.parts.push(strip(part));
            return agg;
          }, {
            input: "",
            parts: []
          });
          route.navigate({
            sessionID: forked.data.id,
            type: "session",
            prompt
          });
          dialog.clear();
        }
      });
    }
    return [fullSession, ...result.reverse()];
  });
  return _$createComponent(DialogSelect, {
    onMove: option => props.onMove(option.value),
    title: "Fork session",
    get options() {
      return options();
    }
  });
}