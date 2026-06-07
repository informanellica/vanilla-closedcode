import { InstallationChannel, InstallationVersion } from "core/installation/version";
export function select() {
  return {
    backend: "express",
    reason: "stable"
  };
}
export function attributes(selection) {
  return {
    "closedcode.server.backend": selection.backend,
    "closedcode.server.backend.reason": selection.reason,
    "closedcode.installation.channel": InstallationChannel,
    "closedcode.installation.version": InstallationVersion
  };
}
export function force(selection, backend) {
  return {
    backend,
    reason: selection.backend === backend ? selection.reason : "explicit"
  };
}
