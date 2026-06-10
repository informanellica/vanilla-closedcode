import { createComponent as _$createComponent } from "@opentui/solid";
import { createMemo, createResource } from "solid-js";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { useDialog } from "#tui/ui/dialog.js";
import { useSDK } from "#tui/context/sdk.js";
import { createStore } from "solid-js/store";
export function DialogTag(props) {
  const sdk = useSDK();
  const dialog = useDialog();
  const [store] = createStore({
    filter: ""
  });
  const [files] = createResource(() => [store.filter], async () => {
    const result = await sdk.client.find.files({
      query: store.filter
    });
    if (result.error) return [];
    const sliced = (result.data ?? []).slice(0, 5);
    return sliced;
  });
  const options = createMemo(() => (files() ?? []).map(file => ({
    value: file,
    title: file
  })));
  return _$createComponent(DialogSelect, {
    title: "Autocomplete",
    get options() {
      return options();
    },
    onSelect: option => {
      props.onSelect?.(option.value);
      dialog.clear();
    }
  });
}