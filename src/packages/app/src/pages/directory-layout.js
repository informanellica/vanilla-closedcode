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
