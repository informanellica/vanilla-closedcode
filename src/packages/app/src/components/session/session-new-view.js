/** @file New-session empty state: brand mark, project path, selected worktree label, and a relative "last modified" time. */
import { createComponent, createEffect, createMemo } from "../../lib/reactivity.js";
import { DateTime } from "luxon";
import { useSync } from "@/context/sync.js";
import { useSDK } from "@/context/sdk.js";
import { useLanguage } from "@/context/language.js";
import { useSessionController } from "@/controllers/session.js";
import { Icon } from "@/bs/icon.js";
import { Mark } from "@/vendor/ui/components/logo.js";
import { getDirectory, getFilename } from "core/util/path";
const MAIN_WORKTREE = "main";
const CREATE_WORKTREE = "create";
const ROOT_CLASS = "size-full d-flex flex-column";

/**
 * Parse a trimmed HTML string into a single detached root element.
 * @param {string} html - Markup whose first element child becomes the root.
 * @returns {HTMLElement} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * The new-session empty state view. Shows the brand mark and title, the
 * project's directory/filename path, the currently selected worktree label
 * (main, a sandbox, or "create new"), and, while a project is loaded, a
 * relative "last modified" timestamp.
 * @param {Object} props - Component props.
 * @param {string} props.worktree - The currently selected worktree identifier ("main", "create", or a sandbox path).
 * @returns {HTMLElement} The view root element.
 */
export function NewSessionView(props) {
  const sync = useSync();
  const sdk = useSDK();
  const language = useLanguage();
  const controller = useSessionController();
  const sandboxes = createMemo(() => sync.project?.sandboxes ?? []);
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE]);
  const current = createMemo(() => {
    const selection = props.worktree;
    if (options().includes(selection)) return selection;
    return MAIN_WORKTREE;
  });
  const projectRoot = createMemo(() => controller.projectRoot());
  const isWorktree = createMemo(() => controller.isWorktree());
  /**
   * Resolve the display label for a worktree option.
   * @param {string} value - A worktree identifier ("main", "create", or a sandbox path).
   * @returns {string} The translated/derived label, including the branch name for "main" when available.
   */
  const label = value => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main");
      const branch = sync.data?.vcs?.branch;
      if (branch) return language.t("session.new.worktree.mainWithBranch", {
        branch
      });
      return language.t("session.new.worktree.main");
    }
    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create");
    return getFilename(value);
  };

  const root = template(`
    <div class="${ROOT_CLASS}">
      <div class="h-12 shrink-0" aria-hidden></div>
      <div class="flex-1 px-6 pb-30 d-flex align-items-center justify-content-center text-center">
        <div class="w-100 max-w-200 d-flex flex-column align-items-center text-center gap-4">
          <div class="d-flex flex-column align-items-center gap-6" data-slot="header">
            <div class="fs-5 fw-medium text-body-emphasis" data-slot="title"></div>
          </div>
          <div class="w-100 d-flex flex-column gap-4 align-items-center">
            <div class="d-flex align-items-start justify-content-center gap-3 min-h-5">
              <div class="small fw-medium text-secondary select-text leading-5 min-w-0 max-w-160 break-words text-center" data-slot="path"><span class="text-body-emphasis" data-slot="filename"></span></div>
            </div>
            <div class="d-flex align-items-start justify-content-center gap-1.5 min-h-5" data-slot="worktree-row">
              <div class="small fw-medium text-secondary select-text leading-5 min-w-0 max-w-160 break-words text-center" data-slot="worktree"></div>
            </div>
            <div style="display: contents" data-slot="last-modified"></div>
          </div>
        </div>
      </div>
    </div>`);
  const headerEl = root.querySelector('[data-slot="header"]');
  const titleEl = root.querySelector('[data-slot="title"]');
  const pathEl = root.querySelector('[data-slot="path"]');
  const filenameEl = root.querySelector('[data-slot="filename"]');
  const worktreeRowEl = root.querySelector('[data-slot="worktree-row"]');
  const worktreeEl = root.querySelector('[data-slot="worktree"]');
  const lastModifiedSlot = root.querySelector('[data-slot="last-modified"]');

  // Brand mark before the title (static).
  headerEl.insertBefore(createComponent(Mark, {
    "class": "w-10"
  }), titleEl);
  createEffect(() => { titleEl.textContent = language.t("session.new.title"); });

  // Project path: directory as a plain text node, filename in the emphasized
  // span (same node shape as the compiled output).
  const dirText = document.createTextNode("");
  pathEl.insertBefore(dirText, filenameEl);
  createEffect(() => { dirText.data = getDirectory(projectRoot()); });
  createEffect(() => { filenameEl.textContent = getFilename(projectRoot()); });

  // Worktree row: static branch icon followed by the live label.
  worktreeRowEl.insertBefore(createComponent(Icon, {
    name: "branch",
    size: "small",
    "class": "mt-0.5 shrink-0"
  }), worktreeEl);
  createEffect(() => { worktreeEl.textContent = label(current()); });

  // Show equivalent: the last-modified row exists only while a project is
  // loaded. Track truthiness only (non-keyed Show semantics) so the row is not
  // rebuilt when the project object itself updates; the nested effects keep the
  // label and the relative time live (locale and timestamp changes).
  const hasProject = createMemo(() => Boolean(sync.project));
  createEffect(() => {
    if (!hasProject()) {
      lastModifiedSlot.replaceChildren();
      return;
    }
    const row = template(`
      <div class="d-flex align-items-start justify-content-center gap-3 min-h-5">
        <div class="small fw-medium text-secondary leading-5 min-w-0 max-w-160 break-words text-center" data-slot="text"></div>
      </div>`);
    const textEl = row.querySelector('[data-slot="text"]');
    const labelText = document.createTextNode("");
    const timeEl = document.createElement("span");
    timeEl.className = "text-body-emphasis";
    textEl.append(labelText, " ", timeEl);
    createEffect(() => { labelText.data = language.t("session.new.lastModified"); });
    createEffect(() => {
      const project = sync.project;
      if (!project) return;
      timeEl.textContent = DateTime.fromMillis(project.time.updated ?? project.time.created).setLocale(language.intl()).toRelative() ?? "";
    });
    lastModifiedSlot.replaceChildren(row);
  });

  return root;
}
