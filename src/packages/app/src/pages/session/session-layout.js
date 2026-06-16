import { useParams } from "../../lib/router/index.js";
import { createMemo } from "../../lib/reactivity.js";
import { useLayout } from "@/context/layout.js";
/** @file Session-scoped layout hooks: derive a stable session key and per-session layout accessors from route params. */

/**
 * Derives the route params and a memoized session key (`<dir>` or `<dir>/<id>`)
 * used to scope per-session layout/tab state.
 * @returns {Object} An object with `params` (route params) and `sessionKey` (memo accessor).
 */
export const useSessionKey = () => {
  const params = useParams();
  const sessionKey = createMemo(() => `${params.dir}${params.id ? "/" + params.id : ""}`);
  return {
    params,
    sessionKey
  };
};
/**
 * Provides the current session's layout context: route params, session key, and
 * memoized accessors for the session's tabs and view state.
 * @returns {Object} An object with `params`, `sessionKey`, `tabs` (memo), and `view` (memo).
 */
export const useSessionLayout = () => {
  const layout = useLayout();
  const {
    params,
    sessionKey
  } = useSessionKey();
  return {
    params,
    sessionKey,
    tabs: createMemo(() => layout.tabs(sessionKey)),
    view: createMemo(() => layout.view(sessionKey))
  };
};