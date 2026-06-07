// Windows console-mode helpers stubbed out for the Node build; restore with
// koffi/node-ffi-napi if Windows TTY support for ENABLE_PROCESSED_INPUT
// toggling is needed.

export function win32DisableProcessedInput() {}
export function win32FlushInputBuffer() {}
export function win32InstallCtrlCGuard() {
  return undefined;
}