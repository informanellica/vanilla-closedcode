/**
 * @file Dialog component: a reactive Bootstrap-modal wrapper used inside the UI
 * tree, with header/title/action, optional description and floating close
 * button, and cleanup of Bootstrap's modal artifacts on unmount.
 */
import { IconButton } from "@/bs/icon-button.js";
import { onCleanup } from "../lib/reactivity.js";

/**
 * Request that the dialog close: invoke the `onClose` prop and dispatch a
 * synthetic Escape keydown so listeners that close on Escape also fire.
 * @param {Object} props - The dialog props (read for `onClose`).
 */
function requestClose(props) {
  props.onClose?.();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

/**
 * Remove leftover Bootstrap modal artifacts (orphaned backdrop, body lock,
 * inline overflow/padding) that remain if a modal is torn down out of band.
 */
function cleanupBootstrapModalLeftovers() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

/**
 * Map a logical dialog size to its Bootstrap modal-dialog size class.
 * @param {string} size - Size keyword (x-large/large/small/normal).
 * @returns {string} The Bootstrap size class, or empty string for normal.
 */
const dialogSizeClass = size => {
  switch (size) {
    case "x-large":
      return "modal-xl";
    case "large":
      return "modal-lg";
    case "small":
      return "modal-sm";
    default:
      return "";
  }
};

/**
 * Reactive Bootstrap modal dialog component. Builds the modal DOM (optional
 * header with title/action or floating close button, optional description, and
 * a body holding the children), shows it via `window.bootstrap.Modal` when
 * available, and tears the modal down on cleanup. Mounts itself immediately on
 * creation.
 * @param {Object} props - Component props.
 * @param {string} props.title - Optional header title.
 * @param {Node} props.action - Optional header action element (replaces the close button).
 * @param {string} props.description - Optional description text below the header.
 * @param {*} props.children - Dialog body content (string/number, Node, or array of Nodes).
 * @param {string} props.size - Dialog size (x-large/large/small/normal).
 * @param {boolean} props.fit - When true, sets the `data-fit` styling hint.
 * @param {string} props.class - Extra class applied to the modal content.
 * @param {Function} props.onClose - Called when the dialog requests to close.
 * @returns {HTMLElement} The modal root element.
 */
export function Dialog(props) {
  let modalEl;
  let instance;

  const close = () => {
    if (instance) {
      try {
        instance.hide();
        return;
      } catch {}
    }
    requestClose(props);
  };

  const hasHeader = () => !!props.title || !!props.action;

  const el = document.createElement("div");
  el.setAttribute("data-component", "dialog");
  el.className = "modal fade";
  el.setAttribute("tabindex", "-1");

  const dialogContainer = document.createElement("div");
  dialogContainer.setAttribute("data-slot", "dialog-container");
  dialogContainer.className = "modal-dialog modal-dialog-scrollable modal-dialog-centered";

  const dialogContent = document.createElement("div");
  dialogContent.setAttribute("data-slot", "dialog-content");
  dialogContent.className = "modal-content";

  let headerEl;
  if (hasHeader()) {
    headerEl = document.createElement("div");
    headerEl.setAttribute("data-slot", "dialog-header");
    headerEl.className = "modal-header d-flex align-items-center";

    const titleEl = document.createElement("h5");
    titleEl.setAttribute("data-slot", "dialog-title");
    titleEl.className = "modal-title text-truncate mb-0";
    if (props.title) {
      titleEl.textContent = props.title;
    }

    const headerActionEl = document.createElement("div");
    headerActionEl.setAttribute("data-slot", "dialog-header-action");
    headerActionEl.className = "ms-auto d-flex align-items-center";

    if (props.action) {
      headerActionEl.appendChild(props.action);
    } else {
      const iconBtn = IconButton({
        "data-slot": "dialog-close-button",
        icon: "close",
        variant: "ghost",
        "aria-label": "Close",
        onClick: close
      });
      headerActionEl.appendChild(iconBtn);
    }

    headerEl.appendChild(titleEl);
    headerEl.appendChild(headerActionEl);
    dialogContent.appendChild(headerEl);
  }

  if (props.description) {
    const descriptionEl = document.createElement("div");
    descriptionEl.setAttribute("data-slot", "dialog-description");
    descriptionEl.className = "px-3 pt-2 text-secondary small";
    descriptionEl.textContent = props.description;
    dialogContent.appendChild(descriptionEl);
  }

  const bodyEl = document.createElement("div");
  bodyEl.setAttribute("data-slot", "dialog-body");
  bodyEl.className = "modal-body d-flex flex-column";

  if (props.children) {
    if (typeof props.children === "string" || typeof props.children === "number") {
      bodyEl.textContent = props.children;
    } else if (props.children instanceof Node) {
      bodyEl.appendChild(props.children);
    } else if (Array.isArray(props.children)) {
      props.children.forEach(child => bodyEl.appendChild(child));
    }
  }

  dialogContent.appendChild(bodyEl);

  dialogContainer.appendChild(dialogContent);
  el.appendChild(dialogContainer);

  modalEl = el;

  const onHiddenHandler = () => requestClose(props);

  if (typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
    instance = new window.bootstrap.Modal(el, { backdrop: true, keyboard: true, focus: true });
    el.addEventListener("hidden.bs.modal", onHiddenHandler);
    instance.show();
  } else {
    el.classList.add("show");
    el.style.display = "block";
  }

  if (!hasHeader()) {
    const floatingCloseBtn = document.createElement("button");
    floatingCloseBtn.type = "button";
    floatingCloseBtn.className = "btn-close";
    floatingCloseBtn.setAttribute("aria-label", "Close");
    floatingCloseBtn.style.cssText = "position:absolute;top:12px;right:14px;z-index:10;";
    floatingCloseBtn.addEventListener("click", close);
    dialogContent.appendChild(floatingCloseBtn);
  }

  const updateStyles = () => {
    if (props.fit) {
      el.dataset.fit = "true";
    } else {
      delete el.dataset.fit;
    }
    if (props.size) {
      el.dataset.size = props.size;
    } else {
      el.dataset.size = "normal";
    }

    dialogContainer.className = ("modal-dialog modal-dialog-scrollable modal-dialog-centered " + dialogSizeClass(props.size)).trim();

    if (hasHeader()) {
      delete dialogContent.dataset.noHeader;
    } else {
      dialogContent.dataset.noHeader = "";
    }

    const extraClasses = [];
    if (props.class) {
      extraClasses.push(props.class);
    }
    if (extraClasses.length > 0) {
      dialogContent.className = "modal-content " + extraClasses.join(" ");
    } else {
      dialogContent.className = "modal-content";
    }
  };

  updateStyles();

  // The reactive owner disposes this dialog by removing `el` from the DOM (on
  // close, or when dialog.show() swaps in another dialog). Bootstrap never sees
  // that, so tear its modal down here — otherwise the .modal-backdrop it appended
  // to <body> is orphaned and grays out the whole window with no way to dismiss it
  // (and it accumulates as dialogs are opened/closed).
  onCleanup(() => {
    try { instance?.dispose(); } catch {}
    cleanupBootstrapModalLeftovers();
  });

  return el;
}
