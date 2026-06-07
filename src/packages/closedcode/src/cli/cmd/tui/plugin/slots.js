import { createSlot, createSolidSlotRegistry } from "@opentui/solid";
import { isRecord } from "@/util/record.js";
function empty(_props) {
  return null;
}
let view = empty;
export const Slot = props => view(props);
function isHostSlotPlugin(value) {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isRecord(value.slots)) return false;
  return true;
}
export function setupSlots(api) {
  const reg = createSolidSlotRegistry(api.renderer, {
    theme: api.theme
  }, {
    onPluginError(event) {
      console.error("[tui.slot] plugin error", {
        plugin: event.pluginId,
        slot: event.slot,
        phase: event.phase,
        source: event.source,
        message: event.error.message
      });
    }
  });
  const slot = createSlot(reg);
  view = props => slot(props);
  return {
    register(plugin) {
      if (!isHostSlotPlugin(plugin)) return () => {};
      return reg.register(plugin);
    }
  };
}