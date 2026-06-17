/** @file Exposes the build-injected installation version, channel, and whether this is a local (unpackaged) build. */
/** Build-injected version string, or "local" when running an unpackaged build. */
export const InstallationVersion = typeof CLOSEDCODE_VERSION === "string" ? CLOSEDCODE_VERSION : "local";
/** Build-injected release channel (e.g. prod/latest/dev/beta), or "local" when running an unpackaged build. */
export const InstallationChannel = typeof CLOSEDCODE_CHANNEL === "string" ? CLOSEDCODE_CHANNEL : "local";
/** True when running an unpackaged local build rather than an installed release. */
export const InstallationLocal = InstallationChannel === "local";