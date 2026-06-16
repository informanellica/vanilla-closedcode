/** @file Home page: project-less landing with a hero, quick-start/configuration sections, recent projects, and server status. */
import { createMemo, createEffect, createComponent } from "../lib/reactivity.js";
import { Button } from "@/bs/button.js";
import { Logo } from "@/vendor/ui/components/logo.js";
import { useLayout } from "@/context/layout.js";
import { useNavigate } from "../lib/router/index.js";
import { base64Encode } from "core/util/encode";
import { usePlatform } from "@/context/platform.js";
import { DateTime } from "luxon";
import { useDialog } from "@/lib/dialog.js";
import { DialogSelectDirectory } from "@/components/dialog-select-directory.js";
import { useServer } from "@/context/server.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";

const tmpl = `<div class="container-fluid px-4 px-xl-5 py-4 overflow-y-auto">
  <header data-slot="home-header" class="d-flex align-items-center pb-3 mb-4 border-bottom">
    <div data-slot="home-title" class="fs-4 fw-semibold text-body-emphasis"></div>
  </header>
  <div data-slot="home-hero" class="pb-3 mb-4 border-bottom">
    <h1 data-slot="hero-title" class="fs-2 fw-semibold text-body-emphasis"></h1>
    <p data-slot="hero-intro" class="col-md-10 fs-6 text-secondary"></p>
  </div>
  <div data-slot="home-grid" class="row g-5"></div>
</div>`;

const sectionTmpl = `<div class="col-md-6">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h2 data-slot="section-title" class="fs-5 fw-semibold text-body-emphasis mb-0"></h2>
    <div data-slot="section-action"></div>
  </div>
  <div data-slot="section-body" class="d-flex flex-column gap-1"></div>
</div>`;

const serverTmpl = `<div data-slot="server-row" class="d-flex align-items-center gap-2 px-2 py-2">
  <span data-slot="server-dot" class="size-2 rounded-circle flex-shrink-0"></span>
  <span data-slot="server-state" class="fw-medium text-body-emphasis"></span>
  <span data-slot="server-host" class="small fw-normal text-secondary font-monospace"></span>
</div>`;

// A single clickable row inside a section: leading icon, reactive label and an
// optional right-aligned reactive hint. label/hint are thunks so language
// switches and relative-time updates keep rendering live.
/**
 * A clickable ghost-button row: leading icon, reactive label, and optional reactive hint.
 * @param {Object} props - Component props.
 * @param {Function} props.label - Accessor returning the row label text.
 * @param {Function} props.hint - Optional accessor returning the right-aligned hint text.
 * @param {string} props.icon - Leading icon name (defaults to "arrow-right").
 * @param {Function} props.onClick - Click handler.
 * @param {boolean} props.mono - When true, render the label in a monospace font.
 * @returns {Element} The button row element.
 */
function Row(props) {
  const labelEl = document.createElement("span");
  labelEl.className = "truncate";
  createEffect(() => {
    labelEl.textContent = props.label();
  });

  const children = [labelEl];
  if (props.hint) {
    const hintEl = document.createElement("span");
    hintEl.className = "small fw-normal text-secondary ms-auto ps-3 flex-shrink-0";
    hintEl.dataset.slot = "muted-hint";
    createEffect(() => {
      hintEl.textContent = props.hint();
    });
    children.push(hintEl);
  }

  return createComponent(Button, {
    size: "normal",
    variant: "ghost",
    icon: props.icon ?? "arrow-right",
    onClick: props.onClick,
    class:
      "text-left px-2 w-100 text-decoration-none link-primary justify-content-start" +
      (props.mono ? " font-monospace" : ""),
    children
  });
}

/**
 * A grid column section with a reactive title, an optional header action element, and a body.
 * @param {Object} props - Component props.
 * @param {Function} props.title - Accessor returning the section title text.
 * @param {Element} props.action - Optional element placed in the section header (e.g. a button).
 * @param {*} props.children - Body content (single node or array of nodes).
 * @returns {Element} The section container element.
 */
function Section(props) {
  const el = document.createElement("div");
  el.innerHTML = sectionTmpl.trim();

  const container = el.firstElementChild;
  const titleEl = container.querySelector('[data-slot="section-title"]');
  const actionSlot = container.querySelector('[data-slot="section-action"]');
  const bodySlot = container.querySelector('[data-slot="section-body"]');

  createEffect(() => {
    titleEl.textContent = props.title();
  });

  if (props.action) {
    actionSlot.appendChild(props.action);
  }

  if (props.children) {
    bodySlot.replaceChildren(...(Array.isArray(props.children) ? props.children : [props.children]));
  }

  return container;
}

/**
 * Home page component shown when no project is open. Renders the hero with an
 * "open project" CTA, quick-start and configuration sections, the five most
 * recent projects, and a live server-status row. Wires up project opening,
 * provider connection, and settings dialogs.
 * @returns {Element} The home page root element.
 */
export default function Home() {
  const sync = useGlobalSync();
  const layout = useLayout();
  const platform = usePlatform();
  const dialog = useDialog();
  const navigate = useNavigate();
  const server = useServer();
  const language = useLanguage();

  const homedir = createMemo(() => sync.data?.path.home);
  const recent = createMemo(() => {
    return (sync.data?.project ?? [])
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5);
  });

  const serverDotClass = createMemo(() => {
    const healthy = server.healthy();
    if (healthy === true) return "bg-icon-success-base";
    if (healthy === false) return "bg-icon-critical-base";
    return "bg-border-weak-base";
  });

  const serverState = createMemo(() => {
    const healthy = server.healthy();
    if (healthy === true) return language.t("home.server.online");
    if (healthy === false) return language.t("home.server.offline");
    return language.t("home.server.connecting");
  });

  /**
   * Open a project: register it in the layout, mark it touched on the server, and navigate to it.
   * @param {string} directory - Absolute project directory path.
   * @returns {void}
   */
  function openProject(directory) {
    layout.projects.open(directory);
    server.projects.touch(directory);
    navigate(`/${base64Encode(directory)}`);
  }
  // e2e hook: the router uses memory integration (no browser history on vcc://),
  // so tests cannot navigate via pushState — expose the real open flow instead.
  // Gated to CDP-debug launches (CLOSEDCODE_REMOTE_DEBUG) so it never exists in
  // a normal run.
  if (window.api?.remoteDebug) window.__closedcode_openProject = openProject;

  /**
   * Prompt the user to choose one or more project directories, then open them.
   * Uses the native directory picker for local servers, otherwise a dialog.
   * @returns {Promise<void>}
   */
  async function chooseProject() {
    const resolve = (result) => {
      if (Array.isArray(result)) {
        result.forEach((directory) => openProject(directory));
      } else if (result) {
        openProject(result);
      }
    };

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true
      });
      resolve(result);
    } else {
      dialog.show(
        () => createComponent(DialogSelectDirectory, { multiple: true, onSelect: resolve }),
        () => resolve(null)
      );
    }
  }

  /**
   * Lazy-load and open the provider-selection dialog.
   * @returns {void}
   */
  function connectProvider() {
    void import("@/components/dialog-select-provider.js").then((x) => {
      dialog.show(() => createComponent(x.DialogSelectProvider, {}));
    });
  }

  /**
   * Lazy-load and open the settings dialog on a given tab.
   * @param {string} tab - The settings tab to open (e.g. "general", "connection").
   * @returns {void}
   */
  function openSettings(tab) {
    void import("@/components/dialog-settings.js").then((x) => {
      dialog.show(() => createComponent(x.DialogSettings, { tab }));
    });
  }

  /**
   * Open settings on the connection tab to manage servers.
   * @returns {void}
   */
  function manageServers() {
    openSettings("connection");
  }

  const root = document.createElement("div");
  root.innerHTML = tmpl.trim();

  const shell = root.firstElementChild;
  const header = shell.querySelector('[data-slot="home-header"]');
  const titleEl = header.querySelector('[data-slot="home-title"]');
  const hero = shell.querySelector('[data-slot="home-hero"]');
  const heroTitleEl = hero.querySelector('[data-slot="hero-title"]');
  const heroIntroEl = hero.querySelector('[data-slot="hero-intro"]');
  const grid = shell.querySelector('[data-slot="home-grid"]');

  header.insertBefore(createComponent(Logo, { class: "w-10 flex-shrink-0 me-3 text-body-emphasis" }), titleEl);

  createEffect(() => {
    titleEl.textContent = "ClosedCode";
  });

  createEffect(() => {
    heroTitleEl.textContent = language.t("home.hero.title");
  });

  createEffect(() => {
    heroIntroEl.textContent = language.t("home.hero.intro");
  });

  const heroBtn = createComponent(Button, {
    variant: "primary",
    size: "large",
    icon: "folder-add-left",
    onClick: chooseProject,
    children: () => language.t("home.hero.cta")
  });
  hero.appendChild(heroBtn);

  const startSection = createComponent(Section, {
    title: () => language.t("home.section.start"),
    children: [
      createComponent(Row, { icon: "folder", label: () => language.t("command.project.open"), onClick: chooseProject }),
      createComponent(Row, { icon: "new-session", label: () => language.t("command.session.new"), onClick: chooseProject }),
      createComponent(Row, { icon: "providers", label: () => language.t("command.provider.connect"), onClick: connectProvider }),
      createComponent(Row, {
        icon: "settings-gear",
        label: () => language.t("command.settings.open"),
        onClick: () => openSettings("general")
      })
    ]
  });
  grid.appendChild(startSection);

  const configSection = createComponent(Section, {
    title: () => language.t("home.section.configuration"),
    children: [
      createComponent(Row, { icon: "settings-gear", label: () => language.t("settings.tab.general"), onClick: () => openSettings("general") }),
      createComponent(Row, { icon: "providers", label: () => language.t("settings.providers.title"), onClick: () => openSettings("connection") }),
      createComponent(Row, { icon: "agent", label: () => language.t("settings.agents.title"), onClick: () => openSettings("connection") }),
      createComponent(Row, { icon: "shield", label: () => language.t("settings.permissions.title"), onClick: () => openSettings("general") })
    ]
  });
  grid.appendChild(configSection);

  const recentSection = createComponent(Section, {
    title: () => language.t("home.recentProjects"),
    action: createComponent(Button, {
      size: "small",
      variant: "ghost",
      icon: "folder-add-left",
      class: "px-2 py-0 small text-secondary",
      onClick: chooseProject,
      children: () => language.t("command.project.open")
    })
  });
  grid.appendChild(recentSection);

  const recentContainer = recentSection.querySelector('[data-slot="section-body"]') || recentSection.lastElementChild;

  createEffect(() => {
    if (recent().length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.textContent = language.t("home.empty.title");
      recentContainer.replaceChildren(emptyEl);
      return;
    }

    const rows = recent().map((project) =>
      createComponent(Row, {
        icon: "folder",
        mono: true,
        label: () => project.worktree.replace(homedir(), "~"),
        hint: () => DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative(),
        onClick: () => openProject(project.worktree)
      })
    );

    recentContainer.replaceChildren(...rows);
  });

  const serverSection = createComponent(Section, {
    title: () => language.t("home.section.server"),
    action: createComponent(Button, {
      size: "small",
      variant: "ghost",
      icon: "settings-gear",
      class: "px-2 py-0 small text-secondary",
      onClick: manageServers,
      children: () => language.t("home.server.manage")
    })
  });
  grid.appendChild(serverSection);

  const serverBody = serverSection.querySelector('[data-slot="section-body"]') || serverSection.lastElementChild;
  serverBody.innerHTML = serverTmpl.trim();
  const serverRow = serverBody.firstElementChild;

  if (serverRow) {
    const dotEl = serverRow.querySelector('[data-slot="server-dot"]');
    const stateEl = serverRow.querySelector('[data-slot="server-state"]');
    const hostEl = serverRow.querySelector('[data-slot="server-host"]');

    createEffect(() => {
      dotEl.className = `size-2 rounded-circle flex-shrink-0 ${serverDotClass()}`;
    });

    createEffect(() => {
      stateEl.textContent = serverState();
    });

    createEffect(() => {
      hostEl.textContent = server.name;
    });
  }

  return shell;
}
