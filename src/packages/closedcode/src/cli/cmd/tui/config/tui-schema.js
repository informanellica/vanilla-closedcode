/** @file Zod schemas describing the TUI config file (tui.json): renderer options, theme, keybind overrides, and plugins. */
import z from "zod";
import { ConfigPlugin } from "#config/plugin.js";
import { ConfigKeybinds } from "#config/keybinds.js";
const KeybindOverride = z.object(Object.fromEntries(Object.keys(ConfigKeybinds.Keybinds.shape).map(key => [key, z.string().optional()]))).strict();
/**
 * Zod schema for TUI renderer options (scroll speed/acceleration, diff style, mouse capture).
 * @type {Object}
 */
export const TuiOptions = z.object({
  scroll_speed: z.number().min(0.001).optional().describe("TUI scroll speed"),
  scroll_acceleration: z.object({
    enabled: z.boolean().describe("Enable scroll acceleration")
  }).optional().describe("Scroll acceleration settings"),
  diff_style: z.enum(["auto", "stacked"]).optional().describe("Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column"),
  mouse: z.boolean().optional().describe("Enable or disable mouse capture (default: true)")
});
/**
 * Zod schema for the full TUI config (tui.json): schema ref, theme, keybind overrides, plugins, and the TuiOptions fields.
 * @type {Object}
 */
export const TuiInfo = z.object({
  $schema: z.string().optional(),
  theme: z.string().optional(),
  keybinds: KeybindOverride.optional(),
  plugin: ConfigPlugin.Spec.zod.array().optional(),
  plugin_enabled: z.record(z.string(), z.boolean()).optional()
}).extend(TuiOptions.shape).strict();