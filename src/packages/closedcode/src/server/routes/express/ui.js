// Express route group for the static UI catch-all: serves embedded web UI assets.
import { Flag } from "core/flag/flag";
import express from "express";
import { lookup as mimeLookup } from "mime-types";
import fs from "node:fs/promises";

// Generated file at build time; loaded lazily.
const embeddedUIPromise = Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI ? Promise.resolve(null) :
  import("closedcode-web-ui.gen.js").then(module => module.default).catch(() => null);

const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:";

function embeddedUI() {
  if (Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI) return Promise.resolve(null);
  return embeddedUIPromise;
}

// mime-types lookup() returns `false` for unknown extensions; normalise to undefined
// so the `?? "text/plain"` fallback behaves as expected.
function getMimeType(filePath) {
  return mimeLookup(filePath) || undefined;
}

// Resolves the embedded UI asset for the request path and streams it, applying
// the CSP header for HTML. Returns 404 when missing, 503 when no embedded bundle.
async function serveUI(req, res) {
  const embeddedWebUI = await embeddedUI();
  const path = req.path;
  if (embeddedWebUI) {
    const match = embeddedWebUI[path.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null;
    if (!match) {
      return res.status(404).json({ error: "Not Found" });
    }
    if (await fs.access(match).then(() => true).catch(() => false)) {
      const mime = getMimeType(match) ?? "text/plain";
      res.set("content-type", mime);
      if (mime.startsWith("text/html")) res.set("content-security-policy", DEFAULT_CSP);
      return res.send(Buffer.from(await fs.readFile(match)));
    }
    return res.status(404).json({ error: "Not Found" });
  }
  // No embedded web UI bundle: do not proxy to an external host. Serve a local error.
  return res.status(503).json({ error: "Web UI is not available in this build." });
}

export function UIRoutes(registry) {
  const router = express.Router();
  // Catch-all static UI route. No describeRoute metadata, validators, or SSE in
  // the original, so nothing is registered against `registry`.
  router.all("/*splat", (req, res, next) => {
    serveUI(req, res).catch(next);
  });
  return router;
}
