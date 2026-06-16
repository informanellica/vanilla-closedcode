/** @file Directory-scoped route layout: decodes the base64 directory slug from the URL and wraps children in the SDK/Sync/Data provider tree for that directory. */
import { DataProvider } from "@/lib/context.js";
import { showToast } from "@/lib/toast.js";
import { base64Encode } from "core/util/encode";
import { useLocation, useNavigate, useParams } from "../lib/router/index.js";
import { createComponent, createEffect, createMemo, createResource } from "../lib/reactivity.js";
import { useLanguage } from "@/context/language.js";
import { LocalProvider } from "@/context/local.js";
import { SDKProvider } from "@/context/sdk.js";
import { SyncProvider, useSync } from "@/context/sync.js";
import { decode64 } from "@/utils/base64.js";
/**
 * Provider component that exposes the synced data for a directory to descendants.
 * Keeps the URL in sync with the canonical directory path, loads the active
 * session resource, and wraps children in DataProvider and LocalProvider.
 * @param {Object} props - Component props.
 * @param {string} props.directory - Absolute directory path this layout is scoped to.
 * @param {*} props.children - Child nodes rendered inside the provider tree.
 * @returns {*} The provider component tree.
 */
function DirectoryDataProvider(props) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const sync = useSync();
  const slug = createMemo(() => base64Encode(props.directory));
  createEffect(() => {
    const next = sync.data?.path.directory;
    if (!next || next === props.directory) return;
    const path = location.pathname.slice(slug().length + 1);
    navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, {
      replace: true
    });
  });
  createResource(() => params.id, id => sync.session.sync(id));
  return createComponent(DataProvider, {
    get data() {
      return sync.data;
    },
    get directory() {
      return props.directory;
    },
    onNavigateToSession: sessionID => navigate(`/${slug()}/session/${sessionID}`),
    onSessionHref: sessionID => `/${slug()}/session/${sessionID}`,
    get children() {
      return createComponent(LocalProvider, {
        get children() {
          return props.children;
        }
      });
    }
  });
}
/**
 * Route layout that resolves the `:dir` slug to a directory path. Decodes the
 * base64 slug; on an invalid URL it toasts an error and redirects to home.
 * When a directory resolves, it mounts the SDK/Sync/Data provider tree around
 * the route children, remounting that tree when the resolved directory changes.
 * @param {Object} props - Component props.
 * @param {*} props.children - Route children to render within the directory scope.
 * @returns {*} A reactive accessor yielding the provider tree, or nothing while unresolved.
 */
export default function Layout(props) {
  const params = useParams();
  const language = useLanguage();
  const navigate = useNavigate();
  let invalid = "";
  const resolved = createMemo(() => {
    if (!params.dir) return "";
    return decode64(params.dir) ?? "";
  });
  createEffect(() => {
    const dir = params.dir;
    if (!dir) return;
    if (resolved()) {
      invalid = "";
      return;
    }
    if (invalid === dir) return;
    invalid = dir;
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl")
    });
    navigate("/", {
      replace: true
    });
  });
  // Keyed <Show> equivalent: resolved() is a memo with === equality, so this
  // view memo re-runs — disposing and remounting the provider tree — exactly
  // when the resolved directory value changes, and yields nothing while it is
  // empty. The tree itself is built via createComponent (untracked), so the
  // memo tracks only resolved(), like Show's condition memo. The router
  // resolves the returned accessor the same way it resolved the Show result.
  return createMemo(() => {
    const directory = resolved();
    if (!directory) return;
    return createComponent(SDKProvider, {
      directory: () => directory,
      get children() {
        return createComponent(SyncProvider, {
          get children() {
            return createComponent(DirectoryDataProvider, {
              directory,
              get children() {
                return props.children;
              }
            });
          }
        });
      }
    });
  });
}
