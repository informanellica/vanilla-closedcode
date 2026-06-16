/** @file Express route group for the static UI catch-all: serves embedded web UI assets. */
import { Flag } from "core/flag/flag";
import express from "express";
import { lookup as mimeLookup } from "mime-types";
import fs from "node:fs/promises";

// Generated file at build time; loaded lazily.
const embeddedUIPromise = Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI ? Promise.resolve(null) :
  import("closedcode-web-ui.gen.js").then(module => module.default).catch(() => null);

const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:";

/**
 * Resolves the lazily-loaded embedded web UI asset map.
 * @returns {Promise<Object>} Promise resolving to the embedded asset map, or null when disabled/unavailable.
 */
function embeddedUI() {
  if (Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI) return Promise.resolve(null);
  return embeddedUIPromise;
}

// mime-types lookup() returns `false` for unknown extensions; normalise to undefined
// so the `?? "text/plain"` fallback behaves as expected.
/**
 * Looks up the MIME type for a file path, normalising the library's `false` to undefined.
 * @param {string} filePath - File path or name to inspect.
 * @returns {string} The resolved MIME type, or undefined when unknown.
 */
function getMimeType(filePath) {
  return mimeLookup(filePath) || undefined;
}

// Resolves the embedded UI asset for the request path and streams it, applying
// the CSP header for HTML. Returns 404 when missing, 503 when no embedded bundle.
/**
 * Serves the embedded web UI asset matching the request path (falling back to index.html).
 * Sets the content type and, for HTML, the default CSP header.
 * @param {Object} req - Express request object (uses `req.path`).
 * @param {Object} res - Express response object.
 * @returns {Promise<Object>} Promise resolving to the Express response (200 with asset, 404 when missing, 503 when no bundle).
 */
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

/**
 * Builds the Express router that serves the embedded web UI via a catch-all route.
 * @param {Object} registry - OpenAPI operation registry (unused here; this route registers no metadata).
 * @returns {Object} Configured Express Router.
 */
export function UIRoutes(registry) {
  const router = express.Router();
  // Catch-all static UI route. No describeRoute metadata, validators, or SSE in
  // the original, so nothing is registered against `registry`.
  router.all("/*splat", (req, res, next) => {
    serveUI(req, res).catch(next);
  });
  return router;
}
