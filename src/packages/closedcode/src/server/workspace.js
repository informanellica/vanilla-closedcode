import { SessionID } from "@/session/schema.js";
import { WorkspaceID } from "@/control-plane/schema.js";
import { Workspace } from "@/control-plane/workspace.js";
import { getAdapter } from "@/control-plane/adapters/index.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { Session } from "@/session/session.js";
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
export function isLocalWorkspaceRoute(method, path) {
  for (const rule of RULES) {
    if (rule.method && rule.method !== method) continue;
    const match = rule.exact ? path === rule.path : path === rule.path || path.startsWith(rule.path + "/");
    if (match) return rule.action === "local";
  }
  return false;
}
export function getWorkspaceRouteSessionID(url) {
  if (url.pathname === "/session/status") return null;
  const id = url.pathname.match(/^\/session\/([^/]+)(?:\/|$)/)?.[1];
  if (!id) return null;
  return SessionID.make(id);
}
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