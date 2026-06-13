// insert() from solid-js/web is the established exception for reactive /
// component-valued children (Show branches, forwarded router children,
// portal-backed components): Solid keeps reconciling the accessors instead of
// freezing a one-time snapshot.
import { insert } from "../lib/reactivity.js";
import { createComponent, createEffect, createMemo, createRenderEffect, createResource, createSignal, For, on, onCleanup, onMount, Show, untrack } from "../lib/reactivity.js";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { useLocation, useNavigate, useParams } from "../lib/router/index.js";
import { useLayout } from "@/context/layout.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { Persist, persisted } from "@/utils/persist.js";
import { base64Encode } from "core/util/encode";
import { decode64 } from "@/utils/base64.js";
import { ResizeHandle } from "@/vendor/ui/components/resize-handle.js";
import { Button } from "@/bs/button.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tooltip } from "@/bs/tooltip.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Dialog } from "@/bs/dialog.js";
import { getFilename } from "core/util/path";
import { usePlatform } from "@/context/platform.js";
import { useSettings } from "@/context/settings.js";
import { createStore, produce } from "../lib/store.js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "../lib/dnd/index.js";
import { useProviders } from "@/hooks/use-providers.js";
import { showToast, Toast, toaster } from "@/lib/toast.js";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useNotification } from "@/context/notification.js";
import { usePermission } from "@/context/permission.js";
import { playSoundById } from "@/utils/sound.js";
import { createAim } from "@/utils/aim.js";
import { setNavigate } from "@/utils/notification-click.js";
import { Worktree as WorktreeState } from "@/utils/worktree.js";
import { setSessionHandoff } from "@/pages/session/handoff.js";
import { useDialog } from "@/lib/dialog.js";
import { useTheme } from "@/lib/theme.js";
import { useCommand } from "@/context/command.js";
import { ConstrainDragXAxis, getDraggableId } from "@/utils/solid-dnd.js";
import { DebugBar } from "@/components/debug-bar.js";
import { AppToolbar } from "@/components/app-toolbar.js";
import { useServer } from "@/context/server.js";
import { useLanguage } from "@/context/language.js";
import { pathKey } from "@/utils/path-key.js";
import { displayName, effectiveWorkspaceOrder, errorMessage, latestRootSession, sortedRootSessions } from "./layout/helpers.js";
import { useLayoutController } from "@/controllers/layout.js";
import { collectNewSessionDeepLinks, collectOpenProjectDeepLinks, deepLinkEvent, drainPendingDeepLinks } from "./layout/deep-links.js";
import { createInlineEditorController } from "./layout/inline-editor.js";
import { LocalWorkspace, SortableWorkspace, WorkspaceDragOverlay } from "./layout/sidebar-workspace.js";
import { ProjectDragOverlay, SortableProject } from "./layout/sidebar-project.js";
import { SidebarContent } from "./layout/sidebar-shell.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Static markup only — translated or user-provided strings are always
// assigned via textContent/text nodes, never interpolated into the markup.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web classList(): change-guarded class toggling against the
// previous map; a key may hold several space-separated class names and empty
// keys are skipped.
function toggleClassKey(node, key, value) {
  const names = key.trim().split(/\s+/);
  for (let i = 0; i < names.length; i++) node.classList.toggle(names[i], value);
}
function applyClassList(node, value, prev = {}) {
  const classKeys = Object.keys(value || {});
  const prevKeys = Object.keys(prev);
  for (let i = 0; i < prevKeys.length; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (let i = 0; i < classKeys.length; i++) {
    const key = classKeys[i];
    const classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}
export default function Layout(props) {
  const [store, setStore,, ready] = persisted(Persist.global("layout.page", ["layout.page.v1"]), createStore({
    lastProjectSession: {},
    activeProject: undefined,
    activeWorkspace: undefined,
    workspaceOrder: {},
    workspaceName: {},
    workspaceBranchName: {},
    workspaceExpanded: {},
    gettingStartedDismissed: false
  }));
  const pageReady = createMemo(() => ready());
  let scrollContainerRef;
  let dialogRun = 0;
  let dialogDead = false;
  const params = useParams();
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const layout = useLayout();
  const layoutReady = createMemo(() => layout.ready());
  const platform = usePlatform();
  const settings = useSettings();
  const [ollamaStat, setOllamaStat] = createSignal("");
  // Optional Ollama GPU/CPU placement readout in the status bar. While enabled,
  // polls /api/ps (via main, no CORS) across configured provider hosts and shows
  // size_vram/size of the loaded model(s) as a GPU vs CPU split. Uses the global
  // config (app-level) — the session-scoped current model isn't available here.
  createEffect(() => {
    if (!settings.general.ollamaStats()) {
      setOllamaStat("");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const api = typeof window !== "undefined" ? window.api : null;
      const providers = globalSync.data?.config?.provider || {};
      const baseURLs = Object.values(providers).map(p => p?.options?.baseURL).filter(Boolean);
      if (!api?.llmPs || !baseURLs.length) {
        if (!cancelled) setOllamaStat("");
        return;
      }
      for (const baseURL of baseURLs) {
        try {
          const rows = await api.llmPs(baseURL);
          if (cancelled) return;
          if (!rows || !rows.length) continue;
          let size = 0,
            vram = 0;
          for (const r of rows) {
            size += r.size || 0;
            vram += r.sizeVram || 0;
          }
          if (!size) continue;
          const gpu = Math.round(vram / size * 100);
          setOllamaStat(`GPU ${gpu}% · CPU ${100 - gpu}%`);
          return;
        } catch {
          /* try next host */
        }
      }
      if (!cancelled) setOllamaStat("");
    };
    void tick();
    const id = setInterval(tick, 4000);
    onCleanup(() => {
      cancelled = true;
      clearInterval(id);
    });
  });
  const server = useServer();
  const notification = useNotification();
  const permission = usePermission();
  const navigate = useNavigate();
  setNavigate(navigate);
  const providers = useProviders();
  const dialog = useDialog();
  const command = useCommand();
  const theme = useTheme();
  const language = useLanguage();
  const initialDirectory = decode64(params.dir);
  const location = useLocation();
  const route = createMemo(() => {
    const slug = params.dir;
    if (!slug) return {
      slug,
      dir: ""
    };
    const dir = decode64(slug);
    if (!dir) return {
      slug,
      dir: ""
    };
    const store = globalSync.peek(dir, {
      bootstrap: false
    });
    return {
      slug,
      store,
      dir: store[0].path.directory || dir
    };
  });
  const availableThemeEntries = createMemo(() => theme.ids().map(id => [id, theme.themes()[id]]));
  const colorSchemeOrder = ["system", "light", "dark"];
  const colorSchemeKey = {
    system: "theme.scheme.system",
    light: "theme.scheme.light",
    dark: "theme.scheme.dark"
  };
  const colorSchemeLabel = scheme => language.t(colorSchemeKey[scheme]);
  const currentDir = createMemo(() => route().dir);
  const [state, setState] = createStore({
    autoselect: !initialDirectory,
    busyWorkspaces: {},
    hoverProject: undefined,
    scrollSessionKey: undefined,
    nav: undefined,
    sortNow: Date.now(),
    sizing: false,
    peek: undefined,
    peeked: false
  });
  const editor = createInlineEditorController();
  const setBusy = (directory, value) => {
    const key = pathKey(directory);
    if (value) {
      setState("busyWorkspaces", key, true);
      return;
    }
    setState("busyWorkspaces", produce(draft => {
      delete draft[key];
    }));
  };
  const isBusy = directory => !!state.busyWorkspaces[pathKey(directory)];
  const navLeave = {
    current: undefined
  };
  const sortNow = () => state.sortNow;
  let sizet;
  let sortNowInterval;
  const sortNowTimeout = setTimeout(() => {
    setState("sortNow", Date.now());
    sortNowInterval = setInterval(() => setState("sortNow", Date.now()), 60_000);
  }, 60_000 - Date.now() % 60_000);
  const aim = createAim({
    enabled: () => !layout.sidebar.opened(),
    active: () => state.hoverProject,
    el: () => state.nav?.querySelector("[data-component='sidebar-rail']") ?? state.nav,
    onActivate: directory => {
      globalSync.child(directory);
      setState("hoverProject", directory);
    }
  });
  onCleanup(() => {
    dialogDead = true;
    dialogRun += 1;
    if (navLeave.current !== undefined) clearTimeout(navLeave.current);
    clearTimeout(sortNowTimeout);
    if (sortNowInterval) clearInterval(sortNowInterval);
    if (sizet !== undefined) clearTimeout(sizet);
    if (peekt !== undefined) clearTimeout(peekt);
    aim.reset();
  });
  onMount(() => {
    const stop = () => setState("sizing", false);
    const blur = () => reset();
    const hide = () => {
      if (document.visibilityState !== "hidden") return;
      reset();
    };
    makeEventListener(window, "pointerup", stop);
    makeEventListener(window, "pointercancel", stop);
    makeEventListener(window, "blur", stop);
    makeEventListener(window, "blur", blur);
    makeEventListener(document, "visibilitychange", hide);
  });
  const sidebarHovering = createMemo(() => !layout.sidebar.opened() && state.hoverProject !== undefined);
  const sidebarExpanded = createMemo(() => layout.sidebar.opened() || sidebarHovering());
  const setHoverProject = value => {
    setState("hoverProject", value);
    if (value !== undefined) return;
    aim.reset();
  };
  const clearHoverProjectSoon = () => queueMicrotask(() => setHoverProject(undefined));
  const disarm = () => {
    if (navLeave.current === undefined) return;
    clearTimeout(navLeave.current);
    navLeave.current = undefined;
  };
  const reset = () => {
    disarm();
    setHoverProject(undefined);
  };
  const arm = () => {
    if (layout.sidebar.opened()) return;
    if (state.hoverProject === undefined) return;
    disarm();
    navLeave.current = window.setTimeout(() => {
      navLeave.current = undefined;
      setHoverProject(undefined);
    }, 300);
  };
  let peekt;
  const hoverProjectData = createMemo(() => {
    const id = state.hoverProject;
    if (!id) return;
    return layout.projects.list().find(project => project.worktree === id);
  });
  const peekProject = createMemo(() => {
    const id = state.peek;
    if (!id) return;
    return layout.projects.list().find(project => project.worktree === id);
  });
  createEffect(() => {
    const p = hoverProjectData();
    if (p) {
      if (peekt !== undefined) {
        clearTimeout(peekt);
        peekt = undefined;
      }
      setState("peek", p.worktree);
      setState("peeked", true);
      return;
    }
    setState("peeked", false);
    if (state.peek === undefined) return;
    if (peekt !== undefined) clearTimeout(peekt);
    peekt = window.setTimeout(() => {
      peekt = undefined;
      setState("peek", undefined);
    }, 180);
  });
  createEffect(() => {
    if (!layout.sidebar.opened()) return;
    setHoverProject(undefined);
  });
  createEffect(() => {
    if (!state.autoselect) return;
    const dir = params.dir;
    if (!dir) return;
    const directory = decode64(dir);
    if (!directory) return;
    setState("autoselect", false);
  });
  const editorOpen = editor.editorOpen;
  const openEditor = editor.openEditor;
  const closeEditor = editor.closeEditor;
  const setEditor = editor.setEditor;
  const InlineEditor = editor.InlineEditor;
  const clearSidebarHoverState = () => {
    if (layout.sidebar.opened()) return;
    reset();
  };
  const navigateWithSidebarReset = href => {
    clearSidebarHoverState();
    navigate(href);
    layout.mobileSidebar.hide();
  };
  function cycleTheme(direction = 1) {
    const ids = availableThemeEntries().map(([id]) => id);
    if (ids.length === 0) return;
    const currentIndex = ids.indexOf(theme.themeId());
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + ids.length) % ids.length;
    const nextThemeId = ids[nextIndex];
    theme.setTheme(nextThemeId);
    showToast({
      title: language.t("toast.theme.title"),
      description: theme.name(nextThemeId)
    });
  }
  function cycleColorScheme(direction = 1) {
    const current = theme.colorScheme();
    const currentIndex = colorSchemeOrder.indexOf(current);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + colorSchemeOrder.length) % colorSchemeOrder.length;
    const next = colorSchemeOrder[nextIndex];
    theme.setColorScheme(next);
    showToast({
      title: language.t("toast.scheme.title"),
      description: colorSchemeLabel(next)
    });
  }
  function setLocale(next) {
    if (next === language.locale()) return;
    language.setLocale(next);
    showToast({
      title: language.t("toast.language.title"),
      description: language.t("toast.language.description", {
        language: language.label(next)
      })
    });
  }
  function cycleLanguage(direction = 1) {
    const locales = language.locales;
    const currentIndex = locales.indexOf(language.locale());
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + locales.length) % locales.length;
    const next = locales[nextIndex];
    if (!next) return;
    setLocale(next);
  }
  const useUpdatePolling = () => onMount(() => {
    if (!platform.checkUpdate || !platform.updateAndRestart) return;
    let toastId;
    let interval;
    const pollUpdate = () => platform.checkUpdate().then(({
      updateAvailable,
      version
    }) => {
      if (!updateAvailable) return;
      if (toastId !== undefined) return;
      toastId = showToast({
        persistent: true,
        icon: "download",
        title: language.t("toast.update.title"),
        description: language.t("toast.update.description", {
          version: version ?? ""
        }),
        actions: [{
          label: language.t("toast.update.action.installRestart"),
          onClick: async () => {
            await platform.updateAndRestart();
          }
        }, {
          label: language.t("toast.update.action.notYet"),
          onClick: "dismiss"
        }]
      });
    });
    createEffect(() => {
      if (!settings.ready()) return;
      if (!settings.updates.startup()) {
        if (interval === undefined) return;
        clearInterval(interval);
        interval = undefined;
        return;
      }
      if (interval !== undefined) return;
      void pollUpdate();
      interval = setInterval(pollUpdate, 10 * 60 * 1000);
    });
    onCleanup(() => {
      if (interval === undefined) return;
      clearInterval(interval);
    });
  });
  const useSDKNotificationToasts = () => onMount(() => {
    const toastBySession = new Map();
    const alertedAtBySession = new Map();
    const cooldownMs = 5000;
    const dismissSessionAlert = sessionKey => {
      const toastId = toastBySession.get(sessionKey);
      if (toastId === undefined) return;
      toaster.dismiss(toastId);
      toastBySession.delete(sessionKey);
      alertedAtBySession.delete(sessionKey);
    };
    const unsub = globalSDK.event.listen(e => {
      if (e.details?.type === "worktree.ready") {
        setBusy(e.name, false);
        WorktreeState.ready(e.name);
        return;
      }
      if (e.details?.type === "worktree.failed") {
        setBusy(e.name, false);
        WorktreeState.failed(e.name, e.details.properties?.message ?? language.t("common.requestFailed"));
        return;
      }
      if (e.details?.type === "question.replied" || e.details?.type === "question.rejected" || e.details?.type === "permission.replied") {
        const props = e.details.properties;
        const sessionKey = `${e.name}:${props.sessionID}`;
        dismissSessionAlert(sessionKey);
        return;
      }
      if (e.details?.type !== "permission.asked" && e.details?.type !== "question.asked") return;
      const title = e.details.type === "permission.asked" ? language.t("notification.permission.title") : language.t("notification.question.title");
      const icon = e.details.type === "permission.asked" ? "checklist" : "bubble-5";
      const directory = e.name;
      const props = e.details.properties;
      if (e.details.type === "permission.asked" && permission.autoResponds(e.details.properties, directory)) return;
      const [store] = globalSync.child(directory, {
        bootstrap: false
      });
      const session = store.session.find(s => s.id === props.sessionID);
      const sessionKey = `${directory}:${props.sessionID}`;
      const sessionTitle = session?.title ?? language.t("command.session.new");
      const projectName = getFilename(directory);
      const description = e.details.type === "permission.asked" ? language.t("notification.permission.description", {
        sessionTitle,
        projectName
      }) : language.t("notification.question.description", {
        sessionTitle,
        projectName
      });
      const href = `/${base64Encode(directory)}/session/${props.sessionID}`;
      const now = Date.now();
      const lastAlerted = alertedAtBySession.get(sessionKey) ?? 0;
      if (now - lastAlerted < cooldownMs) return;
      alertedAtBySession.set(sessionKey, now);
      if (e.details.type === "permission.asked") {
        if (settings.sounds.permissionsEnabled()) {
          void playSoundById(settings.sounds.permissions());
        }
        if (settings.notifications.permissions()) {
          void platform.notify(title, description, href);
        }
      }
      if (e.details.type === "question.asked") {
        if (settings.notifications.agent()) {
          void platform.notify(title, description, href);
        }
      }
      const currentSession = params.id;
      if (pathKey(directory) === pathKey(currentDir()) && props.sessionID === currentSession) return;
      if (pathKey(directory) === pathKey(currentDir()) && session?.parentID === currentSession) return;
      dismissSessionAlert(sessionKey);
      const toastId = showToast({
        persistent: true,
        icon,
        title,
        description,
        actions: [{
          label: language.t("notification.action.goToSession"),
          onClick: () => navigate(href)
        }, {
          label: language.t("common.dismiss"),
          onClick: "dismiss"
        }]
      });
      toastBySession.set(sessionKey, toastId);
    });
    onCleanup(unsub);
    createEffect(() => {
      const currentSession = params.id;
      if (!currentDir() || !currentSession) return;
      const sessionKey = `${currentDir()}:${currentSession}`;
      dismissSessionAlert(sessionKey);
      const [store] = globalSync.child(currentDir(), {
        bootstrap: false
      });
      const childSessions = store.session.filter(s => s.parentID === currentSession);
      for (const child of childSessions) {
        dismissSessionAlert(`${currentDir()}:${child.id}`);
      }
    });
  });
  useUpdatePolling();
  useSDKNotificationToasts();
  function scrollToSession(sessionId, sessionKey) {
    if (!scrollContainerRef) return;
    if (state.scrollSessionKey === sessionKey) return;
    const element = scrollContainerRef.querySelector(`[data-session-id="${sessionId}"]`);
    if (!element) return;
    const containerRect = scrollContainerRef.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom) {
      setState("scrollSessionKey", sessionKey);
      return;
    }
    setState("scrollSessionKey", sessionKey);
    element.scrollIntoView({
      block: "nearest",
      behavior: "smooth"
    });
  }
  const currentProject = createMemo(() => {
    const directory = currentDir();
    if (!directory) return;
    const key = pathKey(directory);
    const projects = layout.projects.list();
    const sandbox = projects.find(p => p.sandboxes?.some(item => pathKey(item) === key));
    if (sandbox) return sandbox;
    const direct = projects.find(p => pathKey(p.worktree) === key);
    if (direct) return direct;
    const [child] = globalSync.child(directory, {
      bootstrap: false
    });
    const id = child.project;
    if (!id) return;
    const meta = globalSync.data.project.find(p => p.id === id);
    const root = meta?.worktree;
    if (!root) return;
    return projects.find(p => p.worktree === root);
  });
  const [autoselecting] = createResource(async () => {
    await ready.promise;
    await layout.ready.promise;
    if (!untrack(() => state.autoselect)) return;
    const list = layout.projects.list();
    const last = server.projects.last();
    if (list.length === 0) {
      if (!last) return;
      await openProject(last, true);
    } else {
      const next = list.find(project => project.worktree === last) ?? list[0];
      if (!next) return;
      await openProject(next.worktree, true);
    }
  });
  const workspaceName = (directory, projectId, branch) => {
    const key = pathKey(directory);
    const direct = store.workspaceName[key] ?? store.workspaceName[directory];
    if (direct) return direct;
    if (!projectId) return;
    if (!branch) return;
    return store.workspaceBranchName[projectId]?.[branch];
  };
  const setWorkspaceName = (directory, next, projectId, branch) => {
    const key = pathKey(directory);
    setStore("workspaceName", key, next);
    if (!projectId) return;
    if (!branch) return;
    if (!store.workspaceBranchName[projectId]) {
      setStore("workspaceBranchName", projectId, {});
    }
    setStore("workspaceBranchName", projectId, branch, next);
  };
  const workspaceLabel = (directory, branch, projectId) => workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory);
  const workspaceSetting = createMemo(() => {
    const project = currentProject();
    if (!project) return false;
    if (project.vcs !== "git") return false;
    return layout.sidebar.workspaces(project.worktree)();
  });
  const visibleSessionDirs = createMemo(() => {
    const project = currentProject();
    if (!project) return [];
    if (!workspaceSetting()) return [project.worktree];
    const activeDir = currentDir();
    return workspaceIds(project).filter(directory => {
      const expanded = store.workspaceExpanded[directory] ?? directory === project.worktree;
      const active = pathKey(directory) === pathKey(activeDir);
      return expanded || active;
    });
  });
  const controller = useLayoutController({
    params,
    navigate,
    platform,
    showToast,
    toaster,
    language,
    store,
    setStore,
    currentDir,
    currentProject,
    visibleSessionDirs,
    route,
    setBusy,
    navigateWithSidebarReset,
    clearSidebarHoverState,
    setWorkspaceName,
    clearLastProjectSession,
    projectRoot
  });
  const prefetchSession = controller.prefetchSession;
  const warm = controller.warm;
  const archiveSession = controller.archiveSession;
  const createWorkspace = controller.createWorkspace;
  const deleteWorkspace = controller.deleteWorkspace;
  const resetWorkspace = controller.resetWorkspace;
  createEffect(() => {
    if (!pageReady()) return;
    if (!layoutReady()) return;
    const projects = layout.projects.list();
    for (const [directory, expanded] of Object.entries(store.workspaceExpanded)) {
      if (!expanded) continue;
      const key = pathKey(directory);
      const project = projects.find(item => pathKey(item.worktree) === key || item.sandboxes?.some(sandbox => pathKey(sandbox) === key));
      if (!project) continue;
      if (project.vcs === "git" && layout.sidebar.workspaces(project.worktree)()) continue;
      setStore("workspaceExpanded", directory, false);
    }
  });
  const currentSessions = createMemo(() => {
    const now = Date.now();
    const dirs = visibleSessionDirs();
    if (dirs.length === 0) return [];
    const result = [];
    for (const dir of dirs) {
      const [dirStore] = globalSync.child(dir, {
        bootstrap: true
      });
      const dirSessions = sortedRootSessions(dirStore, now);
      result.push(...dirSessions);
    }
    return result;
  });
  createEffect(() => {
    const sessions = currentSessions();
    if (sessions.length === 0) return;
    const index = params.id ? sessions.findIndex(s => s.id === params.id) : 0;
    if (index === -1) return;
    if (!params.id) {
      const first = sessions[index];
      if (first) prefetchSession(first, "high");
    }
    warm(sessions, index);
  });
  function navigateSessionByOffset(offset) {
    const sessions = currentSessions();
    if (sessions.length === 0) return;
    const sessionIndex = params.id ? sessions.findIndex(s => s.id === params.id) : -1;
    let targetIndex;
    if (sessionIndex === -1) {
      targetIndex = offset > 0 ? 0 : sessions.length - 1;
    } else {
      targetIndex = (sessionIndex + offset + sessions.length) % sessions.length;
    }
    const session = sessions[targetIndex];
    if (!session) return;
    prefetchSession(session, "high");
    warm(sessions, targetIndex);
    navigateToSession(session);
  }
  function navigateProjectByOffset(offset) {
    const projects = layout.projects.list();
    if (projects.length === 0) return;
    const current = currentProject()?.worktree;
    const fallback = currentDir() ? projectRoot(currentDir()) : undefined;
    const active = current ?? fallback;
    const index = active ? projects.findIndex(project => project.worktree === active) : -1;
    const target = index === -1 ? offset > 0 ? projects[0] : projects[projects.length - 1] : projects[(index + offset + projects.length) % projects.length];
    if (!target) return;

    // warm up child store to prevent flicker
    globalSync.child(target.worktree);
    void openProject(target.worktree);
  }
  function navigateSessionByUnseen(offset) {
    const sessions = currentSessions();
    if (sessions.length === 0) return;
    const hasUnseen = sessions.some(session => notification.session.unseenCount(session.id) > 0);
    if (!hasUnseen) return;
    const activeIndex = params.id ? sessions.findIndex(s => s.id === params.id) : -1;
    const start = activeIndex === -1 ? offset > 0 ? -1 : 0 : activeIndex;
    for (let i = 1; i <= sessions.length; i++) {
      const index = offset > 0 ? (start + i) % sessions.length : (start - i + sessions.length) % sessions.length;
      const session = sessions[index];
      if (!session) continue;
      if (notification.session.unseenCount(session.id) === 0) continue;
      prefetchSession(session, "high");
      warm(sessions, index);
      navigateToSession(session);
      return;
    }
  }
  command.register("layout", () => {
    const commands = [{
      id: "sidebar.toggle",
      title: language.t("command.sidebar.toggle"),
      category: language.t("command.category.view"),
      keybind: "mod+b",
      onSelect: () => layout.sidebar.toggle()
    }, {
      id: "project.open",
      title: language.t("command.project.open"),
      category: language.t("command.category.project"),
      keybind: "mod+o",
      onSelect: () => chooseProject()
    }, {
      id: "project.previous",
      title: language.t("command.project.previous"),
      category: language.t("command.category.project"),
      keybind: "mod+alt+arrowup",
      onSelect: () => navigateProjectByOffset(-1)
    }, {
      id: "project.next",
      title: language.t("command.project.next"),
      category: language.t("command.category.project"),
      keybind: "mod+alt+arrowdown",
      onSelect: () => navigateProjectByOffset(1)
    }, {
      id: "provider.connect",
      title: language.t("command.provider.connect"),
      category: language.t("command.category.provider"),
      onSelect: () => connectProvider()
    }, {
      id: "server.switch",
      title: language.t("command.server.switch"),
      category: language.t("command.category.server"),
      onSelect: () => openServer()
    }, {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: () => openSettings()
    }, {
      id: "session.previous",
      title: language.t("command.session.previous"),
      category: language.t("command.category.session"),
      keybind: "alt+arrowup",
      onSelect: () => navigateSessionByOffset(-1)
    }, {
      id: "session.next",
      title: language.t("command.session.next"),
      category: language.t("command.category.session"),
      keybind: "alt+arrowdown",
      onSelect: () => navigateSessionByOffset(1)
    }, {
      id: "session.previous.unseen",
      title: language.t("command.session.previous.unseen"),
      category: language.t("command.category.session"),
      keybind: "shift+alt+arrowup",
      onSelect: () => navigateSessionByUnseen(-1)
    }, {
      id: "session.next.unseen",
      title: language.t("command.session.next.unseen"),
      category: language.t("command.category.session"),
      keybind: "shift+alt+arrowdown",
      onSelect: () => navigateSessionByUnseen(1)
    }, {
      id: "session.archive",
      title: language.t("command.session.archive"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+backspace",
      disabled: !params.dir || !params.id,
      onSelect: () => {
        const session = currentSessions().find(s => s.id === params.id);
        if (session) void archiveSession(session);
      }
    }, {
      id: "workspace.new",
      title: language.t("workspace.new"),
      category: language.t("command.category.workspace"),
      keybind: "mod+shift+w",
      disabled: !workspaceSetting(),
      onSelect: () => {
        const project = currentProject();
        if (!project) return;
        return createWorkspace(project);
      }
    }, {
      id: "workspace.toggle",
      title: language.t("command.workspace.toggle"),
      description: language.t("command.workspace.toggle.description"),
      category: language.t("command.category.workspace"),
      slash: "workspace",
      disabled: !currentProject() || currentProject()?.vcs !== "git",
      onSelect: () => {
        const project = currentProject();
        if (!project) return;
        if (project.vcs !== "git") return;
        const wasEnabled = layout.sidebar.workspaces(project.worktree)();
        layout.sidebar.toggleWorkspaces(project.worktree);
        showToast({
          title: wasEnabled ? language.t("toast.workspace.disabled.title") : language.t("toast.workspace.enabled.title"),
          description: wasEnabled ? language.t("toast.workspace.disabled.description") : language.t("toast.workspace.enabled.description")
        });
      }
    }, {
      id: "theme.cycle",
      title: language.t("command.theme.cycle"),
      category: language.t("command.category.theme"),
      keybind: "mod+shift+t",
      onSelect: () => cycleTheme(1)
    }];
    for (const [id] of availableThemeEntries()) {
      commands.push({
        id: `theme.set.${id}`,
        title: language.t("command.theme.set", {
          theme: theme.name(id)
        }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewTheme(id);
          return () => theme.cancelPreview();
        }
      });
    }
    commands.push({
      id: "theme.scheme.cycle",
      title: language.t("command.theme.scheme.cycle"),
      category: language.t("command.category.theme"),
      keybind: "mod+shift+s",
      onSelect: () => cycleColorScheme(1)
    });
    for (const scheme of colorSchemeOrder) {
      commands.push({
        id: `theme.scheme.${scheme}`,
        title: language.t("command.theme.scheme.set", {
          scheme: colorSchemeLabel(scheme)
        }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewColorScheme(scheme);
          return () => theme.cancelPreview();
        }
      });
    }
    commands.push({
      id: "language.cycle",
      title: language.t("command.language.cycle"),
      category: language.t("command.category.language"),
      onSelect: () => cycleLanguage(1)
    });
    for (const locale of language.locales) {
      commands.push({
        id: `language.set.${locale}`,
        title: language.t("command.language.set", {
          language: language.label(locale)
        }),
        category: language.t("command.category.language"),
        onSelect: () => setLocale(locale)
      });
    }
    return commands;
  });
  function connectProvider() {
    const run = ++dialogRun;
    void import("@/components/dialog-select-provider.js").then(x => {
      if (dialogDead || dialogRun !== run) return;
      dialog.show(() => createComponent(x.DialogSelectProvider, {}));
    });
  }
  function openServer() {
    const run = ++dialogRun;
    void import("@/components/dialog-select-server.js").then(x => {
      if (dialogDead || dialogRun !== run) return;
      dialog.show(() => createComponent(x.DialogSelectServer, {}));
    });
  }
  function openSettings() {
    const run = ++dialogRun;
    void import("@/components/dialog-settings.js").then(x => {
      if (dialogDead || dialogRun !== run) return;
      dialog.show(() => createComponent(x.DialogSettings, {}));
    });
  }
  function startNewSession() {
    const dir = currentDir();
    if (dir) {
      navigateWithSidebarReset(`/${base64Encode(dir)}/session`);
      return;
    }
    void chooseProject();
  }
  function projectRoot(directory) {
    const key = pathKey(directory);
    const project = layout.projects.list().find(item => pathKey(item.worktree) === key || item.sandboxes?.some(sandbox => pathKey(sandbox) === key));
    if (project) return project.worktree;
    const known = Object.entries(store.workspaceOrder).find(([root, dirs]) => pathKey(root) === key || dirs.some(item => pathKey(item) === key));
    if (known) return known[0];
    const [child] = globalSync.child(directory, {
      bootstrap: false
    });
    const id = child.project;
    if (!id) return directory;
    const meta = globalSync.data.project.find(item => item.id === id);
    return meta?.worktree ?? directory;
  }
  function activeProjectRoot(directory) {
    return currentProject()?.worktree ?? projectRoot(directory);
  }
  function rememberSessionRoute(directory, id, root = activeProjectRoot(directory)) {
    setStore("lastProjectSession", root, {
      directory,
      id,
      at: Date.now()
    });
    return root;
  }
  function clearLastProjectSession(root) {
    if (!store.lastProjectSession[root]) return;
    setStore("lastProjectSession", produce(draft => {
      delete draft[root];
    }));
  }
  function syncSessionRoute(directory, id, root = activeProjectRoot(directory)) {
    rememberSessionRoute(directory, id, root);
    notification.session.markViewed(id);
    const expanded = untrack(() => store.workspaceExpanded[directory]);
    if (expanded === false) {
      setStore("workspaceExpanded", directory, true);
    }
    requestAnimationFrame(() => scrollToSession(id, `${directory}:${id}`));
    return root;
  }
  async function navigateToProject(directory) {
    if (!directory) return;
    const root = projectRoot(directory);
    server.projects.touch(root);
    const project = layout.projects.list().find(item => item.worktree === root);
    let dirs = project ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root]) : [root];
    const canOpen = value => {
      if (!value) return false;
      return dirs.some(item => pathKey(item) === pathKey(value));
    };
    const refreshDirs = async target => {
      if (!target || target === root || canOpen(target)) return canOpen(target);
      const listed = await globalSDK.client.worktree.list({
        directory: root
      }).then(x => x.data ?? []).catch(() => []);
      dirs = effectiveWorkspaceOrder(root, [root, ...listed], store.workspaceOrder[root]);
      return canOpen(target);
    };
    const openSession = async target => {
      if (!canOpen(target.directory)) return false;
      const [data] = globalSync.child(target.directory, {
        bootstrap: false
      });
      if (data.session.some(item => item.id === target.id)) {
        setStore("lastProjectSession", root, {
          directory: target.directory,
          id: target.id,
          at: Date.now()
        });
        navigateWithSidebarReset(`/${base64Encode(target.directory)}/session/${target.id}`);
        return true;
      }
      const resolved = await globalSDK.client.session.get({
        sessionID: target.id
      }).then(x => x.data).catch(() => undefined);
      if (!resolved?.directory) return false;
      if (!canOpen(resolved.directory)) return false;
      setStore("lastProjectSession", root, {
        directory: resolved.directory,
        id: resolved.id,
        at: Date.now()
      });
      navigateWithSidebarReset(`/${base64Encode(resolved.directory)}/session/${resolved.id}`);
      return true;
    };
    const projectSession = store.lastProjectSession[root];
    if (projectSession?.id) {
      await refreshDirs(projectSession.directory);
      const opened = await openSession(projectSession);
      if (opened) return;
      clearLastProjectSession(root);
    }
    const latest = latestRootSession(dirs.map(item => globalSync.child(item, {
      bootstrap: false
    })[0]), Date.now());
    if (latest && (await openSession(latest))) {
      return;
    }
    const fetched = latestRootSession(await Promise.all(dirs.map(async item => ({
      path: {
        directory: item
      },
      session: await globalSDK.client.session.list({
        directory: item
      }).then(x => x.data ?? []).catch(() => [])
    }))), Date.now());
    if (fetched && (await openSession(fetched))) {
      return;
    }
    navigateWithSidebarReset(`/${base64Encode(root)}/session`);
  }
  function navigateToSession(session) {
    if (!session) return;
    navigateWithSidebarReset(`/${base64Encode(session.directory)}/session/${session.id}`);
  }
  function openProject(directory, navigate = true) {
    layout.projects.open(directory);
    if (navigate) return navigateToProject(directory);
  }
  const handleDeepLinks = urls => {
    if (!server.isLocal()) return;
    for (const directory of collectOpenProjectDeepLinks(urls)) {
      void openProject(directory);
    }
    for (const link of collectNewSessionDeepLinks(urls)) {
      void openProject(link.directory, false);
      const slug = base64Encode(link.directory);
      if (link.prompt) {
        setSessionHandoff(slug, {
          prompt: link.prompt
        });
      }
      const href = link.prompt ? `/${slug}/session?prompt=${encodeURIComponent(link.prompt)}` : `/${slug}/session`;
      navigateWithSidebarReset(href);
    }
  };
  onMount(() => {
    const handler = event => {
      const detail = event.detail;
      const urls = detail?.urls ?? [];
      if (urls.length === 0) return;
      handleDeepLinks(urls);
    };
    handleDeepLinks(drainPendingDeepLinks(window));
    makeEventListener(window, deepLinkEvent, handler);
  });
  async function renameProject(project, next) {
    const current = displayName(project);
    if (next === current) return;
    const name = next === getFilename(project.worktree) ? "" : next;
    if (project.id && project.id !== "global") {
      await globalSDK.client.project.update({
        projectID: project.id,
        directory: project.worktree,
        name
      });
      return;
    }
    globalSync.project.meta(project.worktree, {
      name
    });
  }
  const renameWorkspace = (directory, next, projectId, branch) => {
    const current = workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory);
    if (current === next) return;
    setWorkspaceName(directory, next, projectId, branch);
  };
  function closeProject(directory) {
    const list = layout.projects.list();
    const key = pathKey(directory);
    const index = list.findIndex(x => pathKey(x.worktree) === key);
    const active = pathKey(currentProject()?.worktree ?? "") === key;
    if (index === -1) return;
    const next = list[index + 1];
    if (!active) {
      layout.projects.close(directory);
      return;
    }
    if (!next) {
      layout.projects.close(directory);
      navigate("/");
      return;
    }
    navigateWithSidebarReset(`/${base64Encode(next.worktree)}/session`);
    layout.projects.close(directory);
    queueMicrotask(() => {
      void navigateToProject(next.worktree);
    });
  }
  function toggleProjectWorkspaces(project) {
    const enabled = layout.sidebar.workspaces(project.worktree)();
    if (enabled) {
      layout.sidebar.toggleWorkspaces(project.worktree);
      return;
    }
    if (project.vcs !== "git") return;
    layout.sidebar.toggleWorkspaces(project.worktree);
  }
  const showEditProjectDialog = project => {
    const run = ++dialogRun;
    void import("@/components/dialog-edit-project.js").then(x => {
      if (dialogDead || dialogRun !== run) return;
      dialog.show(() => createComponent(x.DialogEditProject, {
        project: project
      }));
    });
  };
  async function chooseProject() {
    function resolve(result) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          void openProject(directory, false);
        }
        void navigateToProject(result[0]);
      } else if (result) {
        void openProject(result);
      }
    }
    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true
      });
      resolve(result);
    } else {
      const run = ++dialogRun;
      void import("@/components/dialog-select-directory.js").then(x => {
        if (dialogDead || dialogRun !== run) return;
        dialog.show(() => createComponent(x.DialogSelectDirectory, {
          multiple: true,
          onSelect: resolve
        }), () => resolve(null));
      });
    }
  }
  function DialogDeleteWorkspace(props) {
    const name = createMemo(() => getFilename(props.directory));
    const [data, setData] = createStore({
      status: "loading",
      dirty: false
    });
    onMount(() => {
      controller.fileStatus(props.directory).then(files => {
        const dirty = files.length > 0;
        setData({
          status: "ready",
          dirty
        });
      }).catch(() => {
        setData({
          status: "error",
          dirty: false
        });
      });
    });
    const handleDelete = () => {
      const leaveDeletedWorkspace = !!params.dir && pathKey(currentDir()) === pathKey(props.directory);
      if (leaveDeletedWorkspace) {
        navigateWithSidebarReset(`/${base64Encode(props.root)}/session`);
      }
      dialog.close();
      void deleteWorkspace(props.root, props.directory, leaveDeletedWorkspace);
    };
    const description = () => {
      if (data.status === "loading") return language.t("workspace.status.checking");
      if (data.status === "error") return language.t("workspace.status.error");
      if (!data.dirty) return language.t("workspace.status.clean");
      return language.t("workspace.status.dirty");
    };
    return createComponent(Dialog, {
      get title() {
        return language.t("workspace.delete.title");
      },
      fit: true,
      get children() {
        const body = template(`<div class="d-flex flex-column gap-4 pl-6 pr-2.5 pb-3"><div class="d-flex flex-column gap-1"><span class="text-body-emphasis"></span><span class="small fw-normal text-secondary"></span></div><div class="d-flex justify-content-end gap-2"></div></div>`);
        const column = body.firstChild;
        const confirmEl = column.firstChild;
        const statusEl = confirmEl.nextSibling;
        const actions = column.nextSibling;
        createRenderEffect(() => {
          confirmEl.textContent = language.t("workspace.delete.confirm", {
            name: name()
          });
        });
        createRenderEffect(() => {
          statusEl.textContent = description();
        });
        // bs/ Button returns a concrete element, so plain appends suffice.
        actions.appendChild(createComponent(Button, {
          variant: "ghost",
          size: "large",
          onClick: () => dialog.close(),
          get children() {
            return language.t("common.cancel");
          }
        }));
        actions.appendChild(createComponent(Button, {
          variant: "primary",
          size: "large",
          get disabled() {
            return data.status === "loading";
          },
          onClick: handleDelete,
          get children() {
            return language.t("workspace.delete.button");
          }
        }));
        return body;
      }
    });
  }
  function DialogResetWorkspace(props) {
    const name = createMemo(() => getFilename(props.directory));
    const [state, setState] = createStore({
      status: "loading",
      dirty: false,
      sessions: []
    });
    const refresh = async () => {
      const sessions = await controller.listWorkspaceSessions(props.directory);
      const active = sessions.filter(session => session.time.archived === undefined);
      setState({
        sessions: active
      });
    };
    onMount(() => {
      controller.fileStatus(props.directory).then(files => {
        const dirty = files.length > 0;
        setState({
          status: "ready",
          dirty
        });
        void refresh();
      }).catch(() => {
        setState({
          status: "error",
          dirty: false
        });
      });
    });
    const handleReset = () => {
      dialog.close();
      void resetWorkspace(props.root, props.directory);
    };
    const archivedCount = () => state.sessions.length;
    const description = () => {
      if (state.status === "loading") return language.t("workspace.status.checking");
      if (state.status === "error") return language.t("workspace.status.error");
      if (!state.dirty) return language.t("workspace.status.clean");
      return language.t("workspace.status.dirty");
    };
    const archivedLabel = () => {
      const count = archivedCount();
      if (count === 0) return language.t("workspace.reset.archived.none");
      if (count === 1) return language.t("workspace.reset.archived.one");
      return language.t("workspace.reset.archived.many", {
        count
      });
    };
    return createComponent(Dialog, {
      get title() {
        return language.t("workspace.reset.title");
      },
      fit: true,
      get children() {
        const body = template(`<div class="d-flex flex-column gap-4 pl-6 pr-2.5 pb-3"><div class="d-flex flex-column gap-1"><span class="text-body-emphasis"></span><span class="small fw-normal text-secondary"></span></div><div class="d-flex justify-content-end gap-2"></div></div>`);
        const column = body.firstChild;
        const confirmEl = column.firstChild;
        const detailEl = confirmEl.nextSibling;
        const actions = column.nextSibling;
        createRenderEffect(() => {
          confirmEl.textContent = language.t("workspace.reset.confirm", {
            name: name()
          });
        });
        // "<description> <archived> <note>" as three live text nodes around
        // the static spaces, matching the compiled inserts into the span.
        const descriptionText = document.createTextNode("");
        const archivedText = document.createTextNode("");
        const noteText = document.createTextNode("");
        detailEl.replaceChildren(descriptionText, document.createTextNode(" "), archivedText, document.createTextNode(" "), noteText);
        createRenderEffect(() => {
          descriptionText.data = description();
        });
        createRenderEffect(() => {
          archivedText.data = archivedLabel();
        });
        createRenderEffect(() => {
          noteText.data = language.t("workspace.reset.note");
        });
        // bs/ Button returns a concrete element, so plain appends suffice.
        actions.appendChild(createComponent(Button, {
          variant: "ghost",
          size: "large",
          onClick: () => dialog.close(),
          get children() {
            return language.t("common.cancel");
          }
        }));
        actions.appendChild(createComponent(Button, {
          variant: "primary",
          size: "large",
          get disabled() {
            return state.status === "loading";
          },
          onClick: handleReset,
          get children() {
            return language.t("workspace.reset.button");
          }
        }));
        return body;
      }
    });
  }
  const activeRoute = {
    session: "",
    sessionProject: "",
    directory: ""
  };
  createEffect(on(() => {
    return [pageReady(), route().slug, params.id, currentProject()?.worktree, currentDir()];
  }, ([ready, slug, id, root, dir]) => {
    if (!ready || !slug || !dir) {
      activeRoute.session = "";
      activeRoute.sessionProject = "";
      activeRoute.directory = "";
      return;
    }
    if (!id) {
      activeRoute.session = "";
      activeRoute.sessionProject = "";
      activeRoute.directory = "";
      return;
    }
    const session = `${slug}/${id}`;
    if (!root) {
      activeRoute.session = session;
      activeRoute.directory = dir;
      activeRoute.sessionProject = "";
      return;
    }
    if (server.projects.last() !== root) server.projects.touch(root);
    const changed = session !== activeRoute.session || dir !== activeRoute.directory;
    if (changed) {
      activeRoute.session = session;
      activeRoute.directory = dir;
      activeRoute.sessionProject = syncSessionRoute(dir, id, root);
      return;
    }
    if (root === activeRoute.sessionProject) return;
    activeRoute.directory = dir;
    activeRoute.sessionProject = rememberSessionRoute(dir, id, root);
  }));
  createEffect(() => {
    const sidebarWidth = layout.sidebar.opened() ? layout.sidebar.width() : 48;
    document.documentElement.style.setProperty("--dialog-left-margin", `${sidebarWidth}px`);
  });
  const side = createMemo(() => Math.max(layout.sidebar.width(), 244));
  const panel = createMemo(() => Math.max(side() - 64, 0));
  const loadedSessionDirs = new Set();
  createEffect(on(visibleSessionDirs, dirs => {
    if (dirs.length === 0) {
      loadedSessionDirs.clear();
      return;
    }
    const next = new Set(dirs);
    for (const directory of next) {
      if (loadedSessionDirs.has(directory)) continue;
      void globalSync.project.loadSessions(directory);
    }
    loadedSessionDirs.clear();
    for (const directory of next) {
      loadedSessionDirs.add(directory);
    }
  }, {
    defer: true
  }));
  function handleDragStart(event) {
    const id = getDraggableId(event);
    if (!id) return;
    setHoverProject(undefined);
    setStore("activeProject", id);
  }
  function handleDragOver(event) {
    const {
      draggable,
      droppable
    } = event;
    if (draggable && droppable) {
      const projects = layout.projects.list();
      const fromIndex = projects.findIndex(p => p.worktree === draggable.id.toString());
      const toIndex = projects.findIndex(p => p.worktree === droppable.id.toString());
      if (fromIndex !== toIndex && toIndex !== -1) {
        layout.projects.move(draggable.id.toString(), toIndex);
      }
    }
  }
  function handleDragEnd() {
    setStore("activeProject", undefined);
  }
  function workspaceIds(project) {
    if (!project) return [];
    const local = project.worktree;
    const dirs = [local, ...(project.sandboxes ?? [])];
    const active = currentProject();
    const directory = pathKey(active?.worktree ?? "") === pathKey(project.worktree) ? currentDir() : undefined;
    const extra = directory && pathKey(directory) !== pathKey(local) && !dirs.some(item => pathKey(item) === pathKey(directory)) ? directory : undefined;
    const pending = extra ? WorktreeState.get(extra)?.status === "pending" : false;
    const ordered = effectiveWorkspaceOrder(local, dirs, store.workspaceOrder[project.worktree]);
    if (pending && extra) return [local, extra, ...ordered.filter(item => item !== local)];
    if (!extra) return ordered;
    if (pending) return ordered;
    return [...ordered, extra];
  }
  const sidebarProject = createMemo(() => {
    if (layout.sidebar.opened()) return currentProject();
    const hovered = hoverProjectData();
    if (hovered) return hovered;
    return currentProject();
  });
  function handleWorkspaceDragStart(event) {
    const id = getDraggableId(event);
    if (!id) return;
    setStore("activeWorkspace", id);
  }
  function handleWorkspaceDragOver(event) {
    const {
      draggable,
      droppable
    } = event;
    if (!draggable || !droppable) return;
    const project = sidebarProject();
    if (!project) return;
    const ids = workspaceIds(project);
    const fromIndex = ids.findIndex(dir => dir === draggable.id.toString());
    const toIndex = ids.findIndex(dir => dir === droppable.id.toString());
    if (fromIndex === -1 || toIndex === -1) return;
    if (fromIndex === toIndex) return;
    const result = ids.slice();
    const [item] = result.splice(fromIndex, 1);
    if (!item) return;
    result.splice(toIndex, 0, item);
    setStore("workspaceOrder", project.worktree, result.filter(directory => pathKey(directory) !== pathKey(project.worktree)));
  }
  function handleWorkspaceDragEnd() {
    setStore("activeWorkspace", undefined);
  }
  const workspaceSidebarCtx = {
    currentDir,
    navList: currentSessions,
    sidebarExpanded,
    sidebarHovering,
    clearHoverProjectSoon,
    prefetchSession,
    archiveSession,
    workspaceName,
    renameWorkspace,
    editorOpen,
    openEditor,
    closeEditor,
    setEditor,
    InlineEditor,
    isBusy,
    workspaceExpanded: (directory, local) => store.workspaceExpanded[directory] ?? local,
    setWorkspaceExpanded: (directory, value) => setStore("workspaceExpanded", directory, value),
    showResetWorkspaceDialog: (root, directory) => dialog.show(() => createComponent(DialogResetWorkspace, {
      root: root,
      directory: directory
    })),
    showDeleteWorkspaceDialog: (root, directory) => dialog.show(() => createComponent(DialogDeleteWorkspace, {
      root: root,
      directory: directory
    })),
    setScrollContainerRef: (el, mobile) => {
      if (!mobile) scrollContainerRef = el;
    }
  };
  const projectSidebarCtx = {
    currentDir,
    currentProject,
    sidebarOpened: () => layout.sidebar.opened(),
    sidebarHovering,
    hoverProject: () => state.hoverProject,
    onProjectMouseEnter: (worktree, event) => aim.enter(worktree, event),
    onProjectMouseLeave: worktree => aim.leave(worktree),
    onProjectFocus: worktree => aim.activate(worktree),
    onHoverOpenChanged: (worktree, hoverOpen) => {
      if (!hoverOpen && state.hoverProject && state.hoverProject !== worktree) return;
      setState("hoverProject", hoverOpen ? worktree : undefined);
    },
    navigateToProject,
    openSidebar: () => layout.sidebar.open(),
    closeProject,
    showEditProjectDialog,
    toggleProjectWorkspaces,
    workspacesEnabled: project => project.vcs === "git" && layout.sidebar.workspaces(project.worktree)(),
    workspaceIds,
    workspaceLabel,
    sessionProps: {
      navList: currentSessions,
      sidebarExpanded,
      clearHoverProjectSoon,
      prefetchSession,
      archiveSession
    }
  };
  const SidebarPanel = panelProps => {
    const project = panelProps.project;
    const merged = createMemo(() => panelProps.mobile || (panelProps.merged ?? layout.sidebar.opened()));
    const hover = createMemo(() => !panelProps.mobile && panelProps.merged === false && !layout.sidebar.opened());
    const empty = createMemo(() => !params.dir && layout.projects.list().length === 0);
    const projectName = createMemo(() => {
      const item = project();
      if (!item) return "";
      return item.name || getFilename(item.worktree);
    });
    const projectId = createMemo(() => project()?.id ?? "");
    const worktree = createMemo(() => project()?.worktree ?? "");
    const slug = createMemo(() => {
      const dir = worktree();
      if (!dir) return "";
      return base64Encode(dir);
    });
    const workspaces = createMemo(() => {
      const item = project();
      if (!item) return [];
      return workspaceIds(item);
    });
    const unseenCount = createMemo(() => workspaces().reduce((total, directory) => total + notification.project.unseenCount(directory), 0));
    const clearNotifications = () => workspaces().filter(directory => notification.project.unseenCount(directory) > 0).forEach(directory => notification.project.markViewed(directory));
    const workspacesEnabled = createMemo(() => {
      const item = project();
      if (!item) return false;
      if (item.vcs !== "git") return false;
      return layout.sidebar.workspaces(item.worktree)();
    });
    const canToggle = createMemo(() => {
      const item = project();
      if (!item) return false;
      return item.vcs === "git" || layout.sidebar.workspaces(item.worktree)();
    });
    const homedir = createMemo(() => globalSync.data.path.home);
    // Static skeleton: panel root > getting-started card.
    const panelRoot = template(`<div><div class="shrink-0 px-3 py-3"><div class="rounded-3 bg-body shadow-xs-border-base" data-component="getting-started"><div class="p-3 d-flex flex-column gap-6"><div class="d-flex flex-column gap-2"><div class="fw-medium text-body-emphasis"></div><div class="text-body" style="line-height:var(--line-height-normal)"></div><div class="text-body" style="line-height:var(--line-height-normal)"></div></div><div data-component="getting-started-actions"></div></div></div></div></div>`);
    const gettingStarted = panelRoot.firstChild;
    const gsText = gettingStarted.firstChild.firstChild.firstChild;
    const gsTitle = gsText.firstChild;
    const gsLine1 = gsTitle.nextSibling;
    const gsLine2 = gsLine1.nextSibling;
    const gsActions = gsText.nextSibling;
    insert(panelRoot, createComponent(Show, {
      get when() {
        return project();
      },
      get fallback() {
        return createComponent(Show, {
          get when() {
            return empty();
          },
          get children() {
            const emptyEl = template(`<div class="flex-1 min-h-0 -mt-4 d-flex align-items-center justify-content-center px-6 pb-64 text-center"><div class="mt-8 d-flex max-w-60 flex-column align-items-center gap-6 text-center"><div class="d-flex flex-column gap-3"><div class="fw-medium text-body-emphasis"></div><div class="text-body" style="line-height:var(--line-height-normal)"></div></div></div></div>`);
            const emptyInner = emptyEl.firstChild;
            const emptyTitle = emptyInner.firstChild.firstChild;
            const emptyDescription = emptyTitle.nextSibling;
            createRenderEffect(() => {
              emptyTitle.textContent = language.t("sidebar.empty.title");
            });
            createRenderEffect(() => {
              emptyDescription.textContent = language.t("sidebar.empty.description");
            });
            emptyInner.appendChild(createComponent(Button, {
              size: "large",
              icon: "folder-add-left",
              onClick: chooseProject,
              get children() {
                return language.t("command.project.open");
              }
            }));
            return emptyEl;
          }
        });
      },
      children: project => [(() => {
        // Project name row: inline editor + path tooltip + actions menu.
        const header = template(`<div class="shrink-0 pl-1 py-1"><div class="group/project d-flex align-items-start justify-content-between gap-2 py-2 pl-2 pr-0"><div class="d-flex flex-column min-w-0"></div></div></div>`);
        const headerRow = header.firstChild;
        const nameColumn = headerRow.firstChild;
        insert(nameColumn, createComponent(InlineEditor, {
          get id() {
            return `project:${projectId()}`;
          },
          value: projectName,
          onSave: next => {
            const item = project();
            if (!item) return;
            void renameProject(item, next);
          },
          "class": "fw-medium text-body-emphasis truncate",
          displayClass: "fw-medium text-body-emphasis truncate",
          stopPropagation: true
        }), null);
        insert(nameColumn, createComponent(Tooltip, {
          placement: "bottom",
          gutter: 2,
          get value() {
            return worktree();
          },
          "class": "shrink-0",
          contentStyle: {
            "max-width": "640px",
            transform: "translate3d(52px, 0, 0)"
          },
          get children() {
            const pathEl = template(`<span class="small fw-normal text-body truncate select-text"></span>`);
            createRenderEffect(() => {
              pathEl.textContent = worktree().replace(homedir(), "~");
            });
            return pathEl;
          }
        }), null);
        insert(headerRow, createComponent(DropdownMenu, {
          get modal() {
            return !sidebarHovering();
          },
            get children() {
              return [createComponent(DropdownMenu.Trigger, {
                as: IconButton,
                icon: "dot-grid",
                variant: "ghost",
                "data-action": "project-menu",
                get ["data-project"]() {
                  return slug();
                },
                "class": "shrink-0 size-6 rounded-2 transition-opacity",
                get classList() {
                  return {
                    "opacity-100": panelProps.mobile || merged(),
                    "opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[expanded]:opacity-100": !panelProps.mobile && !merged()
                  };
                },
                get ["aria-label"]() {
                  return language.t("common.moreOptions");
                }
              }), createComponent(DropdownMenu.Portal, {
                get children() {
                  return createComponent(DropdownMenu.Content, {
                    "class": "mt-1",
                    get children() {
                      return [createComponent(DropdownMenu.Item, {
                        onSelect: () => {
                          const item = project();
                          if (!item) return;
                          showEditProjectDialog(item);
                        },
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              return language.t("common.edit");
                            }
                          });
                        }
                      }), createComponent(DropdownMenu.Item, {
                        "data-action": "project-workspaces-toggle",
                        get ["data-project"]() {
                          return slug();
                        },
                        get disabled() {
                          return !canToggle();
                        },
                        onSelect: () => {
                          const item = project();
                          if (!item) return;
                          toggleProjectWorkspaces(item);
                        },
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              // workspacesEnabled() is already a boolean memo,
                              // so the compiled memo wrapper was redundant.
                              return workspacesEnabled() ? language.t("sidebar.workspaces.disable") : language.t("sidebar.workspaces.enable");
                            }
                          });
                        }
                      }), createComponent(DropdownMenu.Item, {
                        "data-action": "project-clear-notifications",
                        get ["data-project"]() {
                          return slug();
                        },
                        get disabled() {
                          return unseenCount() === 0;
                        },
                        onSelect: clearNotifications,
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              return language.t("sidebar.project.clearNotifications");
                            }
                          });
                        }
                      }), createComponent(DropdownMenu.Separator, {}), createComponent(DropdownMenu.Item, {
                        "data-action": "project-close-menu",
                        get ["data-project"]() {
                          return slug();
                        },
                        onSelect: () => {
                          const dir = worktree();
                          if (!dir) return;
                          closeProject(dir);
                        },
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              return language.t("common.close");
                            }
                          });
                        }
                      })];
                    }
                  });
                }
              })];
            }
        }), null);
        return header;
      })(), (() => {
        // Sessions/workspaces body below the header.
        const bodyEl = template(`<div class="flex-1 min-h-0 d-flex flex-column"></div>`);
        insert(bodyEl, createComponent(Show, {
          get when() {
            return workspacesEnabled();
          },
          get fallback() {
            return [(() => {
              const row = template(`<div class="shrink-0 py-4"></div>`);
              row.appendChild(createComponent(Button, {
                size: "large",
                icon: "new-session",
                "class": "w-full",
                onClick: () => {
                  const dir = worktree();
                  if (!dir) return;
                  navigateWithSidebarReset(`/${base64Encode(dir)}/session`);
                },
                get children() {
                  return language.t("command.session.new");
                }
              }));
              return row;
            })(), (() => {
              const host = template(`<div class="flex-1 min-h-0"></div>`);
              insert(host, createComponent(LocalWorkspace, {
                ctx: workspaceSidebarCtx,
                get project() {
                  return project();
                },
                sortNow: sortNow,
                get mobile() {
                  return panelProps.mobile;
                }
              }));
              return host;
            })()];
          },
          get children() {
            return [(() => {
              const row = template(`<div class="shrink-0 py-4"></div>`);
              row.appendChild(createComponent(Button, {
                size: "large",
                icon: "plus-small",
                "class": "w-full",
                onClick: () => {
                  const item = project();
                  if (!item) return;
                  void createWorkspace(item);
                },
                get children() {
                  return language.t("workspace.new");
                }
              }));
              return row;
            })(), (() => {
              const host = template(`<div class="relative flex-1 min-h-0"></div>`);
              insert(host, createComponent(DragDropProvider, {
                onDragStart: handleWorkspaceDragStart,
                onDragEnd: handleWorkspaceDragEnd,
                onDragOver: handleWorkspaceDragOver,
                collisionDetector: closestCenter,
                get children() {
                  return [createComponent(DragDropSensors, {}), createComponent(ConstrainDragXAxis, {}), (() => {
                    const scroller = template(`<div class="size-full d-flex flex-column py-2 gap-4 overflow-y-auto no-scrollbar [overflow-anchor:none]"></div>`);
                    // Ref binding (compiled use()).
                    if (!panelProps.mobile) scrollContainerRef = scroller;
                    // Runtime For keeps workspace rows stable across reorders,
                    // which solid-dnd's sortable transforms rely on.
                    insert(scroller, createComponent(SortableProvider, {
                      get ids() {
                        return workspaces();
                      },
                      get children() {
                        return createComponent(For, {
                          get each() {
                            return workspaces();
                          },
                          children: directory => createComponent(SortableWorkspace, {
                            ctx: workspaceSidebarCtx,
                            directory: directory,
                            get project() {
                              return project();
                            },
                            sortNow: sortNow,
                            get mobile() {
                              return panelProps.mobile;
                            }
                          })
                        });
                      }
                    }));
                    return scroller;
                  })(), createComponent(DragOverlay, {
                    get children() {
                      return createComponent(WorkspaceDragOverlay, {
                        sidebarProject: sidebarProject,
                        activeWorkspace: () => store.activeWorkspace,
                        workspaceLabel: workspaceLabel
                      });
                    }
                  })];
                }
              }));
              return host;
            })()];
          }
        }));
        return bodyEl;
      })()]
    }), gettingStarted);
    createRenderEffect(() => {
      gsTitle.textContent = language.t("sidebar.gettingStarted.title");
    });
    createRenderEffect(() => {
      gsLine1.textContent = language.t("sidebar.gettingStarted.line1");
    });
    createRenderEffect(() => {
      gsLine2.textContent = language.t("sidebar.gettingStarted.line2");
    });
    gsActions.appendChild(createComponent(Button, {
      size: "large",
      icon: "plus-small",
      onClick: connectProvider,
      get children() {
        return language.t("command.provider.connect");
      }
    }));
    gsActions.appendChild(createComponent(Button, {
      size: "large",
      variant: "ghost",
      onClick: () => setStore("gettingStartedDismissed", true),
      get children() {
        return language.t("toast.update.action.notYet");
      }
    }));
    // Change-guarded reactive classes/styles, mirroring the compiled effect().
    const panelClassPrev = {};
    let prevWidth;
    let prevDismissed;
    createRenderEffect(() => {
      applyClassList(panelRoot, {
        "flex flex-col min-h-0 min-w-0 box-border rounded-tl-[12px] px-3": true,
        "border border-b-0": !merged(),
        "border-l border-t border": merged(),
        "bg-body": true,
        "flex-1 min-w-0": panelProps.mobile,
        "max-w-full overflow-hidden": panelProps.mobile
      }, panelClassPrev);
      const width = panelProps.mobile ? undefined : `${panel()}px`;
      const dismissed = !!(store.gettingStartedDismissed || !(providers.all().length > 0 && providers.connected().length === 0));
      if (width !== prevWidth) {
        prevWidth = width;
        if (width == null) panelRoot.style.removeProperty("width");
        else panelRoot.style.setProperty("width", width);
      }
      if (dismissed !== prevDismissed) gettingStarted.classList.toggle("hidden", prevDismissed = dismissed);
    });
    return panelRoot;
  };
  const projects = () => layout.projects.list();
  const projectOverlay = () => createComponent(ProjectDragOverlay, {
    projects: projects,
    activeProject: () => store.activeProject
  });
  const sidebarContent = mobile => createComponent(SidebarContent, {
    mobile: mobile,
    opened: () => layout.sidebar.opened(),
    get aimMove() {
      return aim.move;
    },
    projects: projects,
    renderProject: project => createComponent(SortableProject, {
      ctx: projectSidebarCtx,
      project: project,
      sortNow: sortNow,
      mobile: mobile
    }),
    handleDragStart: handleDragStart,
    handleDragEnd: handleDragEnd,
    handleDragOver: handleDragOver,
    get openProjectLabel() {
      return language.t("command.project.open");
    },
    openProjectKeybind: () => command.keybind("project.open"),
    onOpenProject: chooseProject,
    renderProjectOverlay: projectOverlay,
    settingsLabel: () => language.t("sidebar.settings"),
    settingsKeybind: () => command.keybind("settings.open"),
    onOpenSettings: openSettings,
    helpLabel: () => language.t("sidebar.help"),
    onOpenHelp: () => platform.openLink("https://github.com/informanellica/vanilla-closedcode"),
    renderPanel: () => mobile ? createComponent(SidebarPanel, {
      project: currentProject,
      mobile: true
    }) : createComponent(SidebarPanel, {
      project: currentProject,
      merged: true
    })
  });
  // ----- Static skeleton: app content root -----
  // viewport children: desktop nav, top border, mobile sidebar wrap, main
  // host, peek panel host, peek shadow.
  const appRoot = template(`<div class="relative bg-body flex-1 min-h-0 min-w-0 d-flex flex-column select-none [&amp;_input]:select-text [&amp;_textarea]:select-text [&amp;_[contenteditable]]:select-text"><div class="flex-1 min-h-0 min-w-0 d-flex"><div class="flex-1 min-h-0 relative"><div class="size-full relative overflow-x-hidden"><nav data-component="sidebar-nav-desktop"><div class="@container w-full h-full contain-strict"></div></nav><div class="hidden xl:block pointer-events-none absolute top-0 right-0 z-0 border-t border" style="left:calc(4rem + 12px)"></div><div class="xl:hidden"><div></div><nav data-component="sidebar-nav-mobile"></nav></div><div><main></main></div><div></div><div><div class="h-full w-px" style="box-shadow:var(--shadow-sidebar-overlay)"></div></div></div></div></div></div>`);
  const contentRow = appRoot.firstChild;
  const viewport = contentRow.firstChild.firstChild;
  const desktopNav = viewport.firstChild;
  const desktopNavInner = desktopNav.firstChild;
  const topBorder = desktopNav.nextSibling;
  const mobileWrap = topBorder.nextSibling;
  const mobileOverlay = mobileWrap.firstChild;
  const mobileNav = mobileOverlay.nextSibling;
  const mainHost = mobileWrap.nextSibling;
  const mainEl = mainHost.firstChild;
  const peekHost = mainHost.nextSibling;
  const peekShadow = peekHost.nextSibling;
  // Subscribe the autoselect resource; it only ever renders an empty string.
  insert(appRoot, () => autoselecting() ?? "", contentRow);
  desktopNav.addEventListener("mouseleave", () => {
    aim.reset();
    if (!sidebarHovering()) return;
    arm();
  });
  desktopNav.addEventListener("mouseenter", () => {
    disarm();
  });
  // Ref binding (compiled use()).
  setState("nav", desktopNav);
  // Static classList from the compiled output.
  desktopNav.classList.add("hidden", "xl:block", "absolute", "inset-y-0", "left-0", "z-10");
  // insert() invokes the accessor with no argument, so the desktop variant
  // renders with mobile undefined, exactly like the compiled output.
  insert(desktopNavInner, sidebarContent);
  insert(viewport, createComponent(Show, {
    get when() {
      return layout.sidebar.opened();
    },
    get children() {
      const handleHost = template(`<div class="hidden xl:block absolute inset-y-0 z-30 w-0 overflow-visible"></div>`);
      // Compiled delegated $$pointerdown -> direct listener (pointerdown
      // always precedes the handle's own mousedown handling, so ordering is
      // unchanged).
      handleHost.addEventListener("pointerdown", () => setState("sizing", true));
      // ResizeHandle returns a concrete element.
      handleHost.appendChild(createComponent(ResizeHandle, {
        direction: "horizontal",
        get size() {
          return layout.sidebar.width();
        },
        min: 244,
        get max() {
          return typeof window === "undefined" ? 1000 : window.innerWidth * 0.3 + 64;
        },
        onResize: w => {
          setState("sizing", true);
          if (sizet !== undefined) clearTimeout(sizet);
          sizet = window.setTimeout(() => setState("sizing", false), 120);
          layout.sidebar.resize(w);
        }
      }));
      createRenderEffect(() => handleHost.style.setProperty("left", `${side()}px`));
      return handleHost;
    }
  }), topBorder);
  // Compiled delegated $$click -> direct listener; the target guard already
  // restricts the handler to clicks on the backdrop itself.
  mobileOverlay.addEventListener("click", e => {
    if (e.target === e.currentTarget) layout.mobileSidebar.hide();
  });
  // The compiled mobile nav had a delegated $$click that only called
  // stopPropagation() to halt Solid's synthetic walk; the nav is a sibling of
  // the backdrop (whose handler also target-guards), so nothing changes
  // without it. A native stopPropagation() here would newly hide clicks from
  // document-level listeners that always saw them before, so it is dropped.
  insert(mobileNav, () => sidebarContent(true));
  // Static classList from the compiled output.
  mainEl.classList.add("size-full", "overflow-x-hidden", "flex", "flex-col", "items-start", "contain-strict", "border-t", "border", "bg-body", "xl:border-l", "xl:rounded-tl-[12px]");
  // Router children stay mounted through the live getter: the chat pane (and
  // the rest of the session page) must persist across reloads exactly as
  // before (provider-visibility reload e2e covers this).
  insert(mainEl, createComponent(Show, {
    get when() {
      return !autoselecting.loading;
    },
    get fallback() {
      return template(`<div class="size-full"></div>`);
    },
    get children() {
      return props.children;
    }
  }));
  peekHost.addEventListener("mouseleave", () => {
    arm();
  });
  // Compiled delegated $$pointerdown/$$mousemove -> direct listeners (disarm
  // is idempotent, so relative ordering does not matter).
  peekHost.addEventListener("pointerdown", disarm);
  peekHost.addEventListener("mouseenter", () => {
    disarm();
    aim.reset();
  });
  peekHost.addEventListener("mousemove", disarm);
  insert(peekHost, createComponent(Show, {
    get when() {
      return peekProject();
    },
    get children() {
      return createComponent(SidebarPanel, {
        project: peekProject,
        merged: false
      });
    }
  }));
  // __APP_ENV__.DEV is fixed at startup; the compiled memo around it could
  // never change, so a plain conditional append is equivalent.
  if (globalThis.__APP_ENV__?.DEV) insert(contentRow, createComponent(DebugBar, {}), null);
  insert(appRoot, createComponent(Toast.Region, {}), null);
  /* sidebar hidden for now (see styles.css); reclaim its left offset.
     Original: layout.sidebar.opened() ? `${side()}px` : "4rem" */
  mainHost.style.setProperty("--main-left", "0px");
  // Change-guarded reactive attributes/classes/styles, mirroring the compiled
  // effect() block.
  const overlayClassPrev = {};
  const mobileNavClassPrev = {};
  const mainHostClassPrev = {};
  const peekClassPrev = {};
  const peekShadowClassPrev = {};
  let prevNavLabel;
  let prevNavWidth;
  let prevMobileNavLabel;
  let prevPeekShadowLeft;
  createRenderEffect(() => {
    const navLabel = language.t("sidebar.nav.projectsAndSessions");
    const navWidth = `${side()}px`;
    const mobileOpened = layout.mobileSidebar.opened();
    const peeking = state.peeked && !layout.sidebar.opened();
    const peekShadowLeft = `calc(4rem + ${panel()}px)`;
    if (navLabel !== prevNavLabel) desktopNav.setAttribute("aria-label", prevNavLabel = navLabel);
    if (navWidth !== prevNavWidth) desktopNav.style.setProperty("width", prevNavWidth = navWidth);
    applyClassList(mobileOverlay, {
      "fixed inset-x-0 top-10 bottom-0 z-40 transition-opacity duration-200": true,
      "opacity-100 pointer-events-auto": mobileOpened,
      "opacity-0 pointer-events-none": !mobileOpened
    }, overlayClassPrev);
    if (navLabel !== prevMobileNavLabel) mobileNav.setAttribute("aria-label", prevMobileNavLabel = navLabel);
    applyClassList(mobileNav, {
      "@container fixed top-10 bottom-0 left-0 z-50 w-full max-w-[400px] overflow-hidden border-r border bg-body transition-transform duration-200 ease-out": true,
      "translate-x-0": mobileOpened,
      "-translate-x-full": !mobileOpened
    }, mobileNavClassPrev);
    applyClassList(mainHost, {
      "absolute inset-0": true,
      "xl:inset-y-0 xl:right-0 xl:left-[var(--main-left)]": true,
      "z-20": true,
      "transition-[left] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[left] motion-reduce:transition-none": !state.sizing
    }, mainHostClassPrev);
    applyClassList(peekHost, {
      "hidden xl:flex absolute inset-y-0 left-16 z-30": true,
      "opacity-100 translate-x-0 pointer-events-auto": peeking,
      "opacity-0 -translate-x-2 pointer-events-none": !peeking,
      "transition-[opacity,transform] motion-reduce:transition-none": true,
      "duration-180 ease-out": peeking,
      "duration-120 ease-in": !peeking
    }, peekClassPrev);
    applyClassList(peekShadow, {
      "hidden xl:block pointer-events-none absolute inset-y-0 right-0 z-25 overflow-hidden": true,
      "opacity-100 translate-x-0": peeking,
      "opacity-0 -translate-x-2": !peeking,
      "transition-[opacity,transform] motion-reduce:transition-none": true,
      "duration-180 ease-out": peeking,
      "duration-120 ease-in": !peeking
    }, peekShadowClassPrev);
    if (peekShadowLeft !== prevPeekShadowLeft) peekShadow.style.setProperty("left", prevPeekShadowLeft = peekShadowLeft);
  });
  // ----- Classic shell: top toolbar row + panes row + status bar -----
  const shell = template(`<div class="d-flex flex-column h-100"><div class="app-topbar shrink-0 d-flex align-items-center gap-1 border-bottom bg-body-tertiary px-1"></div><div class="flex-fill min-h-0 d-flex"></div></div>`);
  const barRow = shell.firstChild;
  const panesRow = barRow.nextSibling;
  insert(barRow, createComponent(AppToolbar, {
      onHome: () => navigate("/"),
      onNewSession: startNewSession,
      onOpenProject: chooseProject,
      onOpenSettings: openSettings,
      onOpenServer: openServer,
      get onToggleSidebar() {
        return layout.sidebar.toggle;
      },
      get onToggleFileTree() {
        return layout.fileTree.toggle;
      },
      get onToggleChat() {
        return layout.chatPanel.toggle;
      },
      onOpenChat: () => {
        layout.chatPanel.open();
        // Focus the chat composer (the only contenteditable on the page) so the
        // user can type immediately. CodeMirror uses a textarea, so no conflict.
        // A single focus can be lost to a post-click re-render/blur, so retry a
        // few times over a short window (re-focusing a focused element is a
        // no-op, so this won't disrupt typing).
        if (typeof document !== "undefined") {
          let tries = 0;
          const focusComposer = () => {
            document.querySelector('[contenteditable="true"]')?.focus();
            if (++tries < 6) setTimeout(focusComposer, 70);
          };
          focusComposer();
        }
      },
      get onToggleReviewPanel() {
        return layout.review.togglePanel;
      },
      editorCanEdit: () => layout.editor.canEdit(),
      editorEditing: () => layout.editor.editing(),
      editorDirty: () => layout.editor.dirty(),
      onToggleEdit: () => layout.editor.toggle(),
      onSave: () => layout.editor.save(),
      colorScheme: () => theme.colorScheme(),
      onSetTheme: scheme => theme.setColorScheme(scheme),
      onHelp: () => platform.openLink("https://github.com/informanellica/vanilla-closedcode"),
      onUndo: () => {
        if (layout.editor.editing()) layout.editor.undo();
        else document.execCommand("undo");
      },
      onRedo: () => {
        if (layout.editor.editing()) layout.editor.redo();
        else document.execCommand("redo");
      },
      onCut: () => {
        if (layout.editor.editing()) layout.editor.cut();
        else document.execCommand("cut");
      },
      onCopy: () => {
        if (layout.editor.editing()) layout.editor.copy();
        else document.execCommand("copy");
      },
      onPaste: () => {
        if (layout.editor.editing()) layout.editor.paste();
        else document.execCommand("paste");
      }
    }));
  panesRow.appendChild(appRoot);
  // Bottom status bar: connection + project (left); editor info + version (right).
  shell.appendChild((() => {
    const statusBar = template(`<footer class="app-statusbar shrink-0 d-flex align-items-center gap-3 border-top bg-body-tertiary px-2 small text-secondary" style="height:24px"><span class="d-flex align-items-center gap-1"><span class="rounded-circle" style="width:8px;height:8px"></span><span></span></span><span class="text-truncate" style="max-width:200px"></span><span class="ms-auto d-flex align-items-center gap-3"></span><span></span></footer>`);
    const connEl = statusBar.firstChild;
    const dotEl = connEl.firstChild;
    const nameEl = dotEl.nextSibling;
    const projEl = connEl.nextSibling;
    const editorEl = projEl.nextSibling;
    const versionEl = editorEl.nextSibling;
    createRenderEffect(() => {
      const h = server.healthy();
      dotEl.classList.toggle("bg-success", h === true);
      dotEl.classList.toggle("bg-danger", h === false);
      dotEl.classList.toggle("bg-secondary", h !== true && h !== false);
      nameEl.textContent = server.name || "—";
      connEl.title = server.isLocal() ? "ローカルサーバー" : "リモートサーバー";
    });
    createRenderEffect(() => {
      const p = currentProject();
      projEl.textContent = p ? p.name || (p.worktree || "").split(/[\\/]/).pop() || "" : "";
    });
    // Notepad++-style editor info, shown only while editing a file.
    createRenderEffect(() => {
      const info = layout.editor.info();
      if (!layout.editor.editing() || !info) {
        editorEl.textContent = "";
        return;
      }
      const sel = info.selChars > 0 ? ` (${info.selChars} 選択)` : "";
      editorEl.textContent = [`行 ${info.line}, 列 ${info.col}${sel}`, `${info.chars} 文字`, info.eol, info.encoding, info.readonly ? "読み取り専用" : "編集可"].join(" | ");
    });
    // Optional Ollama GPU/CPU placement readout (right side, before version).
    const ollamaEl = document.createElement("span");
    ollamaEl.className = "d-flex align-items-center gap-1";
    createRenderEffect(() => {
      const text = ollamaStat();
      ollamaEl.textContent = text;
      ollamaEl.style.display = text ? "" : "none";
    });
    statusBar.insertBefore(ollamaEl, versionEl);
    versionEl.textContent = platform.version ? "v" + platform.version : "";
    return statusBar;
  })());
  return shell;
}