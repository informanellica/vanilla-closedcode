import { insert } from "../lib/reactivity.js";
const placementStyle = (placement) => {
  switch (placement) {
    case "bottom":
      return "position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;";
    case "left":
      return "position:absolute;right:100%;top:50%;transform:translateY(-50%);margin-right:4px;";
    case "right":
      return "position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:4px;";
    case "top":
    default:
      return "position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;";
  }
};

export function Tooltip(props) {
  const inert = { open: false };
  const id = "tooltip-" + Math.random().toString(36).slice(2);
  let popEl = null;

  const isOpen = () => !!props.forceOpen || inert.open;
  const syncPopover = () => {
    if (isOpen()) {
      if (!popEl) {
        popEl = renderContent();
        if (popEl) {
          triggerEl.appendChild(popEl);
        }
      }
      triggerEl.setAttribute("aria-describedby", id);
    } else {
      triggerEl.removeAttribute("aria-describedby");
      if (popEl) {
        popEl.remove();
        popEl = null;
      }
    }
  };
  const open = () => {
    inert.open = true;
    syncPopover();
  };
  const close = () => {
    inert.open = false;
    syncPopover();
  };

  if (props.inactive) {
    return props.children;
  }

  const triggerEl = document.createElement("div");
  triggerEl.setAttribute("data-component", "tooltip-trigger");
  triggerEl.style.position = "relative";
  triggerEl.style.display = "contents";
  if (props.class) {
    triggerEl.className = props.class;
  }
  triggerEl.addEventListener("pointerenter", open);
  triggerEl.addEventListener("pointerleave", close);
  triggerEl.addEventListener("focusin", open);
  triggerEl.addEventListener("focusout", close);

  const renderContent = () => {
    if (!isOpen()) return null;
    const popEl = document.createElement("div");
    popEl.setAttribute("data-component", "tooltip");
    popEl.setAttribute("role", "tooltip");
    popEl.id = id;
    popEl.setAttribute("data-placement", props.placement ?? "top");
    popEl.setAttribute("data-force-open", props.forceOpen ? "true" : "false");

    if (props.contentClass) {
      popEl.classList.add(...props.contentClass.split(/\s+/).filter(Boolean));
    }
    popEl.setAttribute(
      "style",
      placementStyle(props.placement) +
        "z-index:1080;width:max-content;max-width:320px;pointer-events:none;" +
        (props.contentStyle ?? ""),
    );

    if (typeof props.value === "string") {
      popEl.textContent = props.value;
    } else if (props.value instanceof Node) {
      popEl.appendChild(props.value.cloneNode(true));
    }

    return popEl;
  };

  if (typeof props.children === "string") {
    triggerEl.textContent = props.children;
  } else if (props.children instanceof Node) {
    // Do NOT cloneNode: cloning drops addEventListener handlers, which made
    // buttons wrapped in tooltips (e.g. the model-popover "+" button) dead.
    triggerEl.appendChild(props.children);
  } else if (typeof props.children === "function" || Array.isArray(props.children)) {
    // Component/accessor children (e.g. the model-selector popover trigger):
    // there was no branch for these, so the child silently vanished. Let
    // solid-js/web insert() render and track them.
    insert(triggerEl, props.children);
  }

  syncPopover();

  return triggerEl;
}

export function TooltipKeybind(props) {
  const container = document.createElement("span");
  container.setAttribute("data-slot", "tooltip-keybind");

  const titleSpan = document.createElement("span");
  if (typeof props.title === "string") {
    titleSpan.textContent = props.title;
  } else if (props.title instanceof Node) {
    titleSpan.appendChild(props.title.cloneNode(true));
  }
  container.appendChild(titleSpan);

  const keybindSpan = document.createElement("span");
  keybindSpan.setAttribute(
    "class",
    "badge text-bg-secondary rounded ms-2",
  );
  keybindSpan.setAttribute("data-slot", "tooltip-keybind-key");
  if (typeof props.keybind === "string") {
    keybindSpan.textContent = props.keybind;
  } else if (props.keybind instanceof Node) {
    keybindSpan.appendChild(props.keybind.cloneNode(true));
  }
  container.appendChild(keybindSpan);

  return Tooltip({
    ...props,
    value: container,
  });
}
