/** @module Keybind - Parse, compare, and stringify keyboard shortcut descriptors. */

import { isDeepEqual } from "remeda";

/**
 * Keybind info derived from OpenTUI's ParsedKey with our custom `leader` field.
 * This ensures type compatibility and catches missing fields at compile time.
 */

/**
 * Deep-compare two keybind info objects, treating a missing `super` modifier as
 * `false` so partially-specified bindings match correctly.
 *
 * @param {Object} a - The first keybind info (falsy values never match).
 * @param {Object} b - The second keybind info to compare against.
 * @returns {boolean} `true` when the normalized keybinds are deeply equal.
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
 *
 * Normalizes a `" "` key name to `"space"` and defaults a missing `super`
 * modifier to `false`.
 *
 * @param {Object} key - The OpenTUI ParsedKey (with `name`, `ctrl`, `meta`,
 *   `shift`, and optional `super`).
 * @param {boolean} leader - Whether this key was preceded by the leader key.
 * @returns {Object} A normalized keybind info object.
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
/**
 * Render a keybind info object as a display string (e.g. `ctrl+alt+a`).
 *
 * Modifiers are appended in a fixed order (ctrl, alt, super, shift) followed by
 * the key name (`delete` is abbreviated to `del`), joined with `+`. A leader
 * binding is prefixed with `<leader> ` (or rendered as just `<leader>` when no
 * other parts are present).
 *
 * @param {Object} info - The keybind info to render (falsy yields `""`).
 * @returns {string} The human-readable keybind string.
 */
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
/**
 * Parse a keybind specification string into a list of keybind info objects.
 *
 * The spec is a comma-separated list of key combos; each combo is `+`-joined
 * parts that are case-insensitive. `<leader>` is expanded to a `leader`
 * modifier, `alt`/`meta`/`option` map to `meta`, and `esc` maps to the
 * `escape` name. The literal `"none"` yields an empty list.
 *
 * @param {string} key - The keybind specification string.
 * @returns {Array} An array of keybind info objects, one per comma-separated combo.
 */
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