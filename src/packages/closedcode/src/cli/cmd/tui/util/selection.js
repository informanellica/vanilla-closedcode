import * as Clipboard from "./clipboard.js";
export function copy(renderer, toast) {
  const text = renderer.getSelection()?.getSelectedText();
  if (!text) return false;
  Clipboard.copy(text).then(() => toast.show({
    message: "Copied to clipboard",
    variant: "info"
  })).catch(toast.error);
  renderer.clearSelection();
  return true;
}
export * as Selection from "./selection.js";