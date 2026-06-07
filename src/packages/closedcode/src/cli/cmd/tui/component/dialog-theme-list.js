import { createComponent as _$createComponent } from "@opentui/solid";
import { DialogSelect } from "../ui/dialog-select.js";
import { useTheme } from "../context/theme.js";
import { useDialog } from "../ui/dialog.js";
import { onCleanup } from "solid-js";
export function DialogThemeList() {
  const theme = useTheme();
  const options = Object.keys(theme.all()).sort((a, b) => a.localeCompare(b, undefined, {
    sensitivity: "base"
  })).map(value => ({
    title: value,
    value: value
  }));
  const dialog = useDialog();
  let confirmed = false;
  let ref;
  const initial = theme.selected;
  onCleanup(() => {
    if (!confirmed) theme.set(initial);
  });
  return _$createComponent(DialogSelect, {
    title: "Themes",
    options: options,
    current: initial,
    onMove: opt => {
      theme.set(opt.value);
    },
    onSelect: opt => {
      theme.set(opt.value);
      confirmed = true;
      dialog.clear();
    },
    ref: r => {
      ref = r;
    },
    onFilter: query => {
      if (query.length === 0) {
        theme.set(initial);
        return;
      }
      const first = ref.filtered[0];
      if (first) theme.set(first.value);
    }
  });
}