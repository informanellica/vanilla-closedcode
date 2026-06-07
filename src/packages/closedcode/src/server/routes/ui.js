// Shared UI-serving utilities used by the httpapi backend. The Express route
// group lives in routes/express/ui.js; only the Effect-based serveUIEffect
// helper is kept here for the httpapi server.
import { Flag } from "core/flag/flag";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { lookup as mimeLookup } from "mime-types";
function getMimeType(filePath) {
  return mimeLookup(filePath) || undefined;
}

const embeddedUIPromise = Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI ? Promise.resolve(null) :
  import("closedcode-web-ui.gen.js").then(module => module.default).catch(() => null);

const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:";

function embeddedUI() {
  if (Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI) return Promise.resolve(null);
  return embeddedUIPromise;
}

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
