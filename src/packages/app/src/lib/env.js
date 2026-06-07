// Build-less runtime env shim.
//
// The renderer no longer goes through Vite/esbuild, so `import.meta.env.*`
// (a Vite-ism) is unavailable. Instead the desktop renderer HTML sets
// `window.__APP_ENV__` via an inline classic <script> before any module
// loads, and every former `import.meta.env.X` reads from that object here.
//
// Shape of window.__APP_ENV__ (all optional, strings/booleans):
//   { MODE, DEV, PROD, CLOSEDCODE_CHANNEL, VITE_CLOSEDCODE_CHANNEL,
//     VITE_SENTRY_DSN, VITE_SENTRY_RELEASE, VITE_SENTRY_ENVIRONMENT,
//     VITE_BUILD_ID, VITE_CLOSEDCODE_SERVER_HOST, VITE_CLOSEDCODE_SERVER_PORT }

const FALLBACK = {
  MODE: "production",
  DEV: false,
  PROD: true,
  CLOSEDCODE_CHANNEL: "prod",
  VITE_CLOSEDCODE_CHANNEL: "prod",
  VITE_SENTRY_DSN: "",
  VITE_SENTRY_RELEASE: "",
  VITE_SENTRY_ENVIRONMENT: "",
  VITE_BUILD_ID: "dev",
  VITE_CLOSEDCODE_SERVER_HOST: undefined,
  VITE_CLOSEDCODE_SERVER_PORT: undefined,
};

function source() {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  return g.__APP_ENV__ ?? FALLBACK;
}

/**
 * Read one env value. Mirrors `import.meta.env.<key>`.
 * @param {string} key
 * @returns {any}
 */
export function env(key) {
  const s = source();
  return key in s ? s[key] : FALLBACK[key];
}

/** Full env object (mirrors `import.meta.env`). */
export function envAll() {
  return { ...FALLBACK, ...source() };
}

export const isDev = () => env("DEV") === true || env("DEV") === "true";
