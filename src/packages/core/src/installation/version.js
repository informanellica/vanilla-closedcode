export const InstallationVersion = typeof CLOSEDCODE_VERSION === "string" ? CLOSEDCODE_VERSION : "local";
export const InstallationChannel = typeof CLOSEDCODE_CHANNEL === "string" ? CLOSEDCODE_CHANNEL : "local";
export const InstallationLocal = InstallationChannel === "local";