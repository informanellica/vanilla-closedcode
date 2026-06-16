/** @file Server backend selection: chooses the HTTP backend (always Express) and exposes telemetry attributes for it. */
import { InstallationChannel, InstallationVersion } from "core/installation/version";
/**
 * Select the server backend to use.
 * @returns {{backend: string, reason: string}} The chosen backend and the reason it was selected.
 */
export function select() {
  return {
    backend: "express",
    reason: "stable"
  };
}
/**
 * Build telemetry/log attributes describing the selected backend and installation.
 * @param {{backend: string, reason: string}} selection - The backend selection to describe.
 * @returns {Object} A flat map of dotted attribute keys to their string values.
 */
export function attributes(selection) {
  return {
    "closedcode.server.backend": selection.backend,
    "closedcode.server.backend.reason": selection.reason,
    "closedcode.installation.channel": InstallationChannel,
    "closedcode.installation.version": InstallationVersion
  };
}
/**
 * Override the selection to force a specific backend, marking the reason as "explicit"
 * unless the forced backend already matches the current selection.
 * @param {{backend: string, reason: string}} selection - The current backend selection.
 * @param {string} backend - The backend to force.
 * @returns {{backend: string, reason: string}} A new selection using the forced backend.
 */
export function force(selection, backend) {
  return {
    backend,
    reason: selection.backend === backend ? selection.reason : "explicit"
  };
}
