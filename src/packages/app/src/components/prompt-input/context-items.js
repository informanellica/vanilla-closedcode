import { createComponent, createRenderEffect, untrack } from "../../lib/reactivity.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tooltip } from "@/bs/tooltip.js";
import { getDirectory, getFilename, getFilenameTruncated } from "core/util/path";

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

const CARD_BASE_CLASS = "group shrink-0 d-flex flex-column rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover";

export const PromptContextItems = props => {
  // Pass-through wrapper: the original Show inserted the strip directly into
  // the parent, so this must not introduce a layout box of its own.
  const root = document.createElement("div");
  root.style.display = "contents";

  // Tooltip body: directory (truncated from the start) + filename. Built
  // fresh per access; both parts are fixed per item, set via textContent.
  const buildTooltipValue = (directory, filename) => {
    const value = template(`<span class="d-flex max-w-[300px]"><span class="text-white truncate-start [unicode-bidi:plaintext] min-w-0"></span><span class="shrink-0"></span></span>`);
    value.firstElementChild.textContent = directory;
    value.lastElementChild.textContent = filename;
    return value;
  };

  const buildItem = item => {
    const directory = getDirectory(item.path);
    const filename = getFilename(item.path);
    const label = getFilenameTruncated(item.path, 14);
    // The compiled For evaluated this once per row (createRoot untracks), so
    // the highlight refreshes only when the row itself is rebuilt.
    const selected = props.active(item);

    const card = template(`<div><div class="d-flex align-items-center gap-1.5"><div class="d-flex align-items-center small fw-normal min-w-0 font-medium"><span class="text-body-emphasis whitespace-nowrap"></span></div></div></div>`);
    card.className = `${CARD_BASE_CLASS} ${selected ? "bg-primary-subtle shadow-xs-border-hover" : "bg-body"}`;
    card.addEventListener("click", () => props.openComment(item));
    const header = card.firstElementChild;
    const labelWrap = header.firstElementChild;
    const labelEl = labelWrap.firstElementChild;
    labelEl.textContent = label;

    header.insertBefore(createComponent(FileIcon, {
      get node() {
        return {
          path: item.path,
          type: "file"
        };
      },
      class: "shrink-0 size-3.5"
    }), labelWrap);

    // Selection range suffix (":12" / ":12-34"): the span exists only while
    // item.selection is truthy and its text stays live, mirroring the
    // original Show with a memoized line label.
    let selectionEl = null;
    createRenderEffect(() => {
      const sel = item.selection;
      if (!sel) {
        if (selectionEl) {
          selectionEl.remove();
          selectionEl = null;
        }
        return;
      }
      if (!selectionEl) {
        selectionEl = template(`<span class="text-secondary whitespace-nowrap shrink-0"></span>`);
        labelWrap.appendChild(selectionEl);
      }
      selectionEl.textContent = sel.startLine === sel.endLine ? `:${sel.startLine}` : `:${sel.startLine}-${sel.endLine}`;
    });

    header.appendChild(createComponent(IconButton, {
      type: "button",
      icon: "close-small",
      variant: "ghost",
      class: "ml-auto size-3.5 text-secondary transition-all",
      onClick: e => {
        e.stopPropagation();
        props.remove(item);
      },
      get ["aria-label"]() {
        return props.t("prompt.context.removeFile");
      }
    }));

    // Optional comment line under the header; created/removed on truthiness
    // changes, text kept live while present.
    let commentEl = null;
    createRenderEffect(() => {
      const comment = item.comment;
      if (!comment) {
        if (commentEl) {
          commentEl.remove();
          commentEl = null;
        }
        return;
      }
      if (!commentEl) {
        commentEl = template(`<div class="small fw-normal text-body-emphasis ml-5 pr-1 truncate"></div>`);
        card.appendChild(commentEl);
      }
      commentEl.textContent = comment;
    });

    return createComponent(Tooltip, {
      get value() {
        return buildTooltipValue(directory, filename);
      },
      placement: "top",
      openDelay: 2000,
      get children() {
        return card;
      }
    });
  };

  // Show + For replacement: the strip exists only while there are items and
  // every row is rebuilt when the list changes. Rows are built untracked so
  // only props.items re-runs this effect (the compiled mapper was untracked
  // too); the nested per-row effects are owned here and disposed on rebuild.
  createRenderEffect(() => {
    const items = props.items;
    if (!(items.length > 0)) {
      root.replaceChildren();
      return;
    }
    const strip = template(`<div class="d-flex flex-nowrap align-items-start gap-2 p-2 overflow-x-auto no-scrollbar"></div>`);
    for (const item of items) strip.appendChild(untrack(() => buildItem(item)));
    root.replaceChildren(strip);
  });

  return root;
};
