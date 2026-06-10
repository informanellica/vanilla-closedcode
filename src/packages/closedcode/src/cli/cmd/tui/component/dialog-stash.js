import { createComponent as _$createComponent } from "@opentui/solid";
import { useDialog } from "#tui/ui/dialog.js";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { createMemo, createSignal } from "solid-js";
import { Locale } from "#util/locale.js";
import { useTheme } from "../context/theme.js";
import { useKeybind } from "../context/keybind.js";
import { usePromptStash } from "./prompt/stash.js";
function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return Locale.datetime(timestamp);
}
function getStashPreview(input, maxLength = 50) {
  const firstLine = input.split("\n")[0].trim();
  return Locale.truncate(firstLine, maxLength);
}
export function DialogStash(props) {
  const dialog = useDialog();
  const stash = usePromptStash();
  const {
    theme
  } = useTheme();
  const keybind = useKeybind();
  const [toDelete, setToDelete] = createSignal();
  const options = createMemo(() => {
    const entries = stash.list();
    // Show most recent first
    return entries.map((entry, index) => {
      const isDeleting = toDelete() === index;
      const lineCount = (entry.input.match(/\n/g)?.length ?? 0) + 1;
      return {
        title: isDeleting ? `Press ${keybind.print("stash_delete")} again to confirm` : getStashPreview(entry.input),
        bg: isDeleting ? theme.error : undefined,
        value: index,
        description: getRelativeTime(entry.timestamp),
        footer: lineCount > 1 ? `~${lineCount} lines` : undefined
      };
    }).toReversed();
  });
  return _$createComponent(DialogSelect, {
    title: "Stash",
    get options() {
      return options();
    },
    onMove: () => {
      setToDelete(undefined);
    },
    onSelect: option => {
      const entries = stash.list();
      const entry = entries[option.value];
      if (entry) {
        stash.remove(option.value);
        props.onSelect(entry);
      }
      dialog.clear();
    },
    get keybind() {
      return [{
        keybind: keybind.all.stash_delete?.[0],
        title: "delete",
        onTrigger: option => {
          if (toDelete() === option.value) {
            stash.remove(option.value);
            setToDelete(undefined);
            return;
          }
          setToDelete(option.value);
        }
      }];
    }
  });
}