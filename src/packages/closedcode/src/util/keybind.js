import { isDeepEqual } from "remeda";

/**
 * Keybind info derived from OpenTUI's ParsedKey with our custom `leader` field.
 * This ensures type compatibility and catches missing fields at compile time.
 */

export function match(a, b) {
  if (!a) return false;
  const normalizedA = {
    ...a,
    super: a.super ?? false
  };
  const normalizedB = {
    ...b,
    super: b.super ?? false
  };
  return isDeepEqual(normalizedA, normalizedB);
}

/**
 * Convert OpenTUI's ParsedKey to our Keybind.Info format.
 * This helper ensures all required fields are present and avoids manual object creation.
 */
export function fromParsedKey(key, leader = false) {
  return {
    name: key.name === " " ? "space" : key.name,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
    super: key.super ?? false,
    leader
  };
}
export function toString(info) {
  if (!info) return "";
  const parts = [];
  if (info.ctrl) parts.push("ctrl");
  if (info.meta) parts.push("alt");
  if (info.super) parts.push("super");
  if (info.shift) parts.push("shift");
  if (info.name) {
    if (info.name === "delete") parts.push("del");else parts.push(info.name);
  }
  let result = parts.join("+");
  if (info.leader) {
    result = result ? `<leader> ${result}` : `<leader>`;
  }
  return result;
}
export function parse(key) {
  if (key === "none") return [];
  return key.split(",").map(combo => {
    // Handle <leader> syntax by replacing with leader+
    const normalized = combo.replace(/<leader>/g, "leader+");
    const parts = normalized.toLowerCase().split("+");
    const info = {
      ctrl: false,
      meta: false,
      shift: false,
      leader: false,
      name: ""
    };
    for (const part of parts) {
      switch (part) {
        case "ctrl":
          info.ctrl = true;
          break;
        case "alt":
        case "meta":
        case "option":
          info.meta = true;
          break;
        case "super":
          info.super = true;
          break;
        case "shift":
          info.shift = true;
          break;
        case "leader":
          info.leader = true;
          break;
        case "esc":
          info.name = "escape";
          break;
        default:
          info.name = part;
          break;
      }
    }
    return info;
  });
}
export * as Keybind from "./keybind.js";