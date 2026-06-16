/**
 * @file Workspace-route resolution for the server. Decides whether an incoming
 * request should be served locally or proxied to a remote workspace adapter,
 * and provides the URL/session helpers that drive that decision.
 */
import { SessionID } from "#session/schema.js";
import { WorkspaceID } from "#control-plane/schema.js";
import { Workspace } from "#control-plane/workspace.js";
import { getAdapter } from "#control-plane/adapters/index.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { Session } from "#session/session.js";
const RULES = [{
  path: "/experimental/workspace",
  action: "local"
}, {
  path: "/session/status",
  action: "forward"
}, {
  method: "GET",
  path: "/session",
  action: "local"
}];
/**
 * Decide whether a request path/method should be served locally rather than
 * proxied, by matching it against the static RULES table. Rules may pin a
 * method and match a path exactly or as a prefix; the first matching rule wins.
 * @param {string} method - HTTP method of the request (e.g. "GET").
 * @param {string} path - Request URL pathname.
 * @returns {boolean} True when the matched rule's action is "local"; false otherwise (including no match).
 */
export function isLocalWorkspaceRoute(method, path) {
  for (const rule of RULES) {
    if (rule.method && rule.method !== method) continue;
    const match = rule.exact ? path === rule.path : path === rule.path || path.startsWith(rule.path + "/");
    if (match) return rule.action === "local";
  }
  return false;
}
/**
 * Extract the session ID embedded in a `/session/{id}` route URL. Returns null
 * for the `/session/status` route and for any URL without a session segment.
 * @param {URL} url - Absolute request URL.
 * @returns {SessionID} The parsed SessionID, or null when none is present.
 */
export function getWorkspaceRouteSessionID(url) {
  if (url.pathname === "/session/status") return null;
  const id = url.pathname.match(/^\/session\/([^/]+)(?:\/|$)/)?.[1];
  if (!id) return null;
  return SessionID.make(id);
}
/**
 * Build the upstream URL used to proxy a request to a remote workspace target.
 * Joins the target's base path with the request pathname, carries over the
 * request search/hash, and strips the internal `workspace` query parameter.
 * @param {string} target - Base URL of the remote workspace adapter.
 * @param {URL} requestURL - The incoming request URL being proxied.
 * @returns {URL} The fully-qualified proxy destination URL.
 */
export function workspaceProxyURL(target, requestURL) {
  const proxyURL = new URL(target);
  proxyURL.pathname = `${proxyURL.pathname.replace(/\/$/, "")}${requestURL.pathname}`;
  proxyURL.search = requestURL.search;
  proxyURL.hash = requestURL.hash;
  proxyURL.searchParams.delete("workspace");
  return proxyURL;
}

/**
 * Resolve the effective workspace + adapter target for an incoming request URL,
 * mirroring InstanceMiddleware / planRequest. Pure resolution only — performs no
 * proxying and no response writes. Used by both the HTTP middleware and the
 * WebSocket upgrade handler so the selection logic lives in one place.
 *
 * @param {URL} url            absolute request URL (built by caller)
 * @param {string} method      HTTP method (for isLocalWorkspaceRoute)
 * @param {WorkspaceID|undefined} envWorkspaceID  Flag.CLOSEDCODE_WORKSPACE_ID (already WorkspaceID.make'd) or undefined
 * @returns {Promise<Object>} A workspace-route resolution, one of three shapes
 *   discriminated by `kind`:
 *   - `{ kind: "local",   workspaceID, directory? }` — serve locally
 *   - `{ kind: "missing", workspaceID }` — known workspace, not resolvable here
 *   - `{ kind: "remote",  workspace, target, workspaceID }` — proxy to `target`
 */
export async function resolveWorkspaceRoute(url, method, envWorkspaceID) {
  const sessionID = getWorkspaceRouteSessionID(url);
  let ownedWorkspaceID;
  if (sessionID) {
    try {
      const session = await AppRuntime.runPromise(Session.Service.use(svc => svc.get(sessionID)));
      ownedWorkspaceID = session?.workspaceID;
    } catch {
      ownedWorkspaceID = undefined;
    }
  }
  const queryWorkspace = url.searchParams.get("workspace");
  const workspaceID = ownedWorkspaceID ?? (queryWorkspace ? WorkspaceID.make(queryWorkspace) : undefined);

  if (envWorkspaceID || !workspaceID) return { kind: "local", workspaceID: envWorkspaceID ?? workspaceID };

  const workspace = await AppRuntime.runPromise(Workspace.Service.use(svc => svc.get(workspaceID)));
  if (workspace === undefined) return { kind: "missing", workspaceID };

  if (isLocalWorkspaceRoute(method, url.pathname) || url.pathname.startsWith("/console")) {
    return { kind: "local", workspaceID };
  }
  const adapter = getAdapter(workspace.projectID, workspace.type);
  const target = await adapter.target(workspace);
  if (target.type === "remote") return { kind: "remote", workspace, target, workspaceID };
  return { kind: "local", workspaceID, directory: target.directory };
}