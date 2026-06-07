import { createComponent as _$createComponent } from "@opentui/solid";
import { useDialog } from "@tui/ui/dialog.js";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { createContext, createMemo, createSignal, getOwner, onCleanup, runWithOwner, useContext } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useKeybind } from "@tui/context/keybind.js";
const ctx = createContext();
function init() {
  const root = getOwner();
  const [registrations, setRegistrations] = createSignal([]);
  const [suspendCount, setSuspendCount] = createSignal(0);
  const dialog = useDialog();
  const keybind = useKeybind();
  const entries = createMemo(() => {
    const all = registrations().flatMap(x => x());
    return all.map(x => ({
      ...x,
      footer: x.keybind ? keybind.print(x.keybind) : undefined
    }));
  });
  const isEnabled = option => option.enabled !== false;
  const isVisible = option => isEnabled(option) && !option.hidden;
  const visibleOptions = createMemo(() => entries().filter(option => isVisible(option)));
  const suggestedOptions = createMemo(() => visibleOptions().filter(option => option.suggested).map(option => ({
    ...option,
    value: `suggested:${option.value}`,
    category: "Suggested"
  })));
  const suspended = () => suspendCount() > 0;
  useKeyboard(evt => {
    if (suspended()) return;
    if (dialog.stack.length > 0) return;
    if (evt.defaultPrevented) return;
    for (const option of entries()) {
      if (!isEnabled(option)) continue;
      if (option.keybind && keybind.match(option.keybind, evt)) {
        evt.preventDefault();
        option.onSelect?.(dialog);
        return;
      }
    }
  });
  const result = {
    trigger(name) {
      for (const option of entries()) {
        if (option.value === name) {
          if (!isEnabled(option)) return;
          option.onSelect?.(dialog);
          return;
        }
      }
    },
    slashes() {
      return visibleOptions().flatMap(option => {
        const slash = option.slash;
        if (!slash) return [];
        return {
          display: "/" + slash.name,
          description: option.description ?? option.title,
          aliases: slash.aliases?.map(alias => "/" + alias),
          onSelect: () => result.trigger(option.value)
        };
      });
    },
    keybinds(enabled) {
      setSuspendCount(count => count + (enabled ? -1 : 1));
    },
    suspended,
    show() {
      dialog.replace(() => _$createComponent(DialogCommand, {
        get options() {
          return visibleOptions();
        },
        get suggestedOptions() {
          return suggestedOptions();
        }
      }));
    },
    register(cb) {
      const owner = getOwner() ?? root;
      if (!owner) return () => {};
      let list;

      // TUI plugins now register commands via an async store that runs outside an active reactive scope.
      // runWithOwner attaches createMemo/onCleanup to this owner so plugin registrations stay reactive and dispose correctly.
      runWithOwner(owner, () => {
        list = createMemo(cb);
        const ref = list;
        if (!ref) return;
        setRegistrations(arr => [ref, ...arr]);
        onCleanup(() => {
          setRegistrations(arr => arr.filter(x => x !== ref));
        });
      });
      if (!list) return () => {};
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const ref = list;
        if (!ref) return;
        setRegistrations(arr => arr.filter(x => x !== ref));
      };
    }
  };
  return result;
}
export function useCommandDialog() {
  const value = useContext(ctx);
  if (!value) {
    throw new Error("useCommandDialog must be used within a CommandProvider");
  }
  return value;
}
export function CommandProvider(props) {
  const value = init();
  const dialog = useDialog();
  const keybind = useKeybind();
  useKeyboard(evt => {
    if (value.suspended()) return;
    if (dialog.stack.length > 0) return;
    if (evt.defaultPrevented) return;
    if (keybind.match("command_list", evt)) {
      evt.preventDefault();
      value.show();
      return;
    }
  });
  return _$createComponent(ctx.Provider, {
    value: value,
    get children() {
      return props.children;
    }
  });
}
function DialogCommand(props) {
  let ref;
  const list = () => {
    if (ref?.filter) return props.options;
    return [...props.suggestedOptions, ...props.options];
  };
  return _$createComponent(DialogSelect, {
    ref: r => ref = r,
    title: "Commands",
    get options() {
      return list();
    }
  });
}