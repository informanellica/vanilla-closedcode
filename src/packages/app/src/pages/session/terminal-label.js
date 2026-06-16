/** @file Computes the display label for a terminal tab from its title and numbering. */
import { isDefaultTitle as isDefaultTerminalTitle } from "@/context/terminal-title.js";
/**
 * Builds a terminal tab label, preferring a custom title and falling back to a
 * numbered/default localized title when the title is empty or auto-generated.
 * @param {Object} input - Descriptor with `title`, `titleNumber`, and a translator `t`.
 * @returns {string} The resolved tab label.
 */
export const terminalTabLabel = input => {
  const title = input.title ?? "";
  const number = input.titleNumber ?? 0;
  const isDefaultTitle = Number.isFinite(number) && number > 0 && isDefaultTerminalTitle(title, number);
  if (title && !isDefaultTitle) return title;
  if (number > 0) return input.t("terminal.title.numbered", {
    number
  });
  if (title) return title;
  return input.t("terminal.title");
};