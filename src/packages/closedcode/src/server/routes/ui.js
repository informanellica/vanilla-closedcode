/**
 * @file Shared UI-serving utilities used by the httpapi backend. The Express
 * route group lives in routes/express/ui.js; only the Effect-based
 * serveUIEffect helper is kept here for the httpapi server.
 */
// Shared UI-serving utilities used by the httpapi backend. The Express route
// group lives in routes/express/ui.js; only the Effect-based serveUIEffect
// helper is kept here for the httpapi server.
import { Flag } from "core/flag/flag";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { lookup as mimeLookup } from "mime-types";
/**
 * Look up the MIME type for a file path by extension.
 * @param {string} filePath - File path or name whose extension is inspected.
 * @returns {string|undefined} The matched MIME type, or undefined if unknown.
 */
function getMimeType(filePath) {
  return mimeLookup(filePath) || undefined;
}

const embeddedUIPromise = Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI ? Promise.resolve(null) :
  import("closedcode-web-ui.gen.js").then(module => module.default).catch(() => null);

const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:";

/**
 * Resolve the lazily-imported embedded web UI bundle (a map of asset path to
 * on-disk file path), or null when the embedded UI is disabled or unavailable.
 * @returns {Promise<Object>} The embedded UI manifest object, or null.
 */
function embeddedUI() {
  if (Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI) return Promise.resolve(null);
  return embeddedUIPromise;
}

/**
 * Serve a static file from the embedded web UI bundle for the given request.
 * Resolves the request path against the embedded manifest (falling back to
 * index.html), reads the matched file, and returns it with the appropriate
 * content-type and CSP headers. Returns 404 when the asset is missing and 503
 * when the build has no embedded web UI.
 * @param {Object} request - HTTP request whose url is matched against the bundle.
 * @param {Object} services - Service bag providing fs.existsSafe and fs.readFile.
 * @returns {Effect} An Effect yielding the HttpServerResponse to send.
 */
export function serveUIEffect(request, services) {
  return Effect.gen(function* () {
    const embeddedWebUI = yield* Effect.promise(() => embeddedUI());
    const path = new URL(request.url, "http://localhost").pathname;
    if (embeddedWebUI) {
      const match = embeddedWebUI[path.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null;
      if (!match) return HttpServerResponse.jsonUnsafe({
        error: "Not Found"
      }, {
        status: 404
      });
      if (yield* services.fs.existsSafe(match)) {
        const mime = getMimeType(match) ?? "text/plain";
        const headers = new Headers({
          "content-type": mime
        });
        if (mime.startsWith("text/html")) headers.set("content-security-policy", DEFAULT_CSP);
        return HttpServerResponse.raw(yield* services.fs.readFile(match), {
          headers
        });
      }
      return HttpServerResponse.jsonUnsafe({
        error: "Not Found"
      }, {
        status: 404
      });
    }
    return HttpServerResponse.jsonUnsafe({
      error: "Web UI is not available in this build."
    }, {
      status: 503
    });
  });
}
