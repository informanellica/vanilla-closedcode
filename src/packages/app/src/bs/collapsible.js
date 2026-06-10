const iconMap = {
  agent: "bi-robot",
  theme: "bi-circle-half",
  build: "bi-hammer",
  planner: "bi-list-check",
  src: "bi-file-earmark-code",
  "align-right": "bi-text-right",
  archive: "bi-archive",
  "arrow-down-to-line": "bi-box-arrow-in-down",
  "arrow-left": "bi-arrow-left",
  "arrow-right": "bi-arrow-right",
  "arrow-undo-down": "bi-arrow-return-left",
  "arrow-counterclockwise": "bi-arrow-counterclockwise",
  "arrow-clockwise": "bi-arrow-clockwise",
  "arrow-up": "bi-arrow-up",
  brain: "bi-cpu",
  branch: "bi-diagram-2",
  "bubble-5": "bi-chat-dots",
  "bullet-list": "bi-list-ul",
  check: "bi-check-lg",
  "check-small": "bi-check",
  checklist: "bi-list-check",
  "chevron-double-right": "bi-chevron-double-right",
  "chevron-down": "bi-chevron-down",
  "chevron-grabber-vertical": "bi-chevron-expand",
  "chevron-left": "bi-chevron-left",
  "chevron-right": "bi-chevron-right",
  "circle-ban-sign": "bi-slash-circle",
  "circle-check": "bi-check-circle",
  "circle-x": "bi-x-circle",
  clipboard: "bi-clipboard",
  close: "bi-x-lg",
  "close-small": "bi-x",
  scissors: "bi-scissors",
  "cloud-upload": "bi-cloud-upload",
  code: "bi-code-slash",
  "code-lines": "bi-code-square",
  collapse: "bi-arrows-collapse",
  comment: "bi-chat",
  console: "bi-terminal",
  copy: "bi-copy",
  dash: "bi-dash",
  discord: "bi-discord",
  "dot-grid": "bi-three-dots",
  download: "bi-download",
  edit: "bi-pencil",
  "edit-small-2": "bi-pencil-square",
  enter: "bi-arrow-return-left",
  expand: "bi-arrows-expand",
  eye: "bi-eye",
  "file-tree": "bi-diagram-3",
  "file-tree-active": "bi-diagram-3-fill",
  folder: "bi-folder",
  "folder-add-left": "bi-folder-plus",
  fork: "bi-bezier2",
  github: "bi-github",
  glasses: "bi-eyeglasses",
  help: "bi-question-circle",
  home: "bi-house",
  keyboard: "bi-keyboard",
  "layout-bottom": "bi-layout-text-window-reverse",
  "layout-bottom-full": "bi-layout-text-window-reverse",
  "layout-bottom-partial": "bi-layout-text-window-reverse",
  "layout-left": "bi-layout-sidebar",
  "layout-left-full": "bi-layout-sidebar",
  "layout-left-partial": "bi-layout-sidebar",
  "layout-right": "bi-layout-sidebar-reverse",
  "layout-right-full": "bi-layout-sidebar-reverse",
  "layout-right-partial": "bi-layout-sidebar-reverse",
  link: "bi-link-45deg",
  "magnifying-glass": "bi-search",
  "magnifying-glass-menu": "bi-search",
  mcp: "bi-hdd-network",
  menu: "bi-list",
  models: "bi-boxes",
  "new-session": "bi-chat-square-text",
  "new-session-active": "bi-chat-square-text-fill",
  "open-file": "bi-file-earmark-arrow-up",
  "pencil-line": "bi-pencil",
  photo: "bi-image",
  plus: "bi-plus-lg",
  "plus-small": "bi-plus",
  prompt: "bi-chevron-right",
  providers: "bi-plug",
  reset: "bi-arrow-counterclockwise",
  review: "bi-clipboard-check",
  "review-active": "bi-clipboard-check-fill",
  selector: "bi-chevron-expand",
  server: "bi-hdd-stack",
  "settings-gear": "bi-gear",
  share: "bi-share",
  shield: "bi-shield",
  sidebar: "bi-layout-sidebar",
  "sidebar-active": "bi-layout-sidebar-fill",
  sliders: "bi-sliders",
  "speech-bubble": "bi-chat",
  "square-arrow-top-right": "bi-box-arrow-up-right",
  status: "bi-activity",
  "status-active": "bi-activity",
  stop: "bi-stop-fill",
  task: "bi-list-task",
  terminal: "bi-terminal",
  "terminal-active": "bi-terminal-fill",
  trash: "bi-trash",
  warning: "bi-exclamation-triangle",
  "window-cursor": "bi-window"
};

const FALLBACK = "bi-question-circle";

function setAttr(el, attr, value) {
  if (value != null && value !== false && value !== "") {
    el.setAttribute(attr, value === true ? "" : String(value));
  }
}

function getClassList(classList, localClass, biClass, size) {
  const classes = { ...classList };
  classes.bi = true;
  classes[biClass] = true;
  if (localClass) classes[localClass] = true;
  if (size) classes[size] = true;
  return Object.keys(classes).filter(k => !!classes[k]).join(" ");
}

function renderIcon(name, size) {
  const biClass = iconMap[name] || FALLBACK;
  const el = document.createElement("i");
  setAttr(el, "data-component", "icon");
  setAttr(el, "aria-hidden", "true");
  setAttr(el, "class", getClassList({}, null, biClass, size));
  setAttr(el, "data-size", size || "normal");
  return el;
}

function CollapsibleRoot(props) {
  const root = document.createElement("div");
  root.setAttribute("data-component", "collapsible");

  let uncontrolledOpen = !!props.defaultOpen;

  function getIsOpen() {
    return props.open !== undefined ? !!props.open : uncontrolledOpen;
  }

  function setOpen(next) {
    const value = typeof next === "function" ? next(getIsOpen()) : next;
    if (props.open === undefined) uncontrolledOpen = !!value;
    props.onOpenChange?.(!!value);
  }

  const ctx = {
    isOpen: getIsOpen,
    setOpen,
    toggle() {
      if (props.disabled) return;
      setOpen(v => !v);
    },
    get disabled() {
      return !!props.disabled;
    },
    get forceMount() {
      return !!props.forceMount;
    }
  };

  root.__collapsibleContext = ctx;

  function applyClassList(el, classList, extraClass) {
    const classes = { ...classList };
    if (extraClass) classes[extraClass] = true;
    el.className = Object.keys(classes).filter(k => !!classes[k]).join(" ");
  }

  applyClassList(root, props.classList || {}, props.class);

  function updateAttributes() {
    const open = getIsOpen();
    root.dataset.variant = props.variant || "normal";
    if (open) {
      root.setAttribute("data-expanded", "");
      root.removeAttribute("data-closed");
    } else {
      root.removeAttribute("data-expanded");
      root.setAttribute("data-closed", "");
    }
    if (props.disabled) {
      root.setAttribute("data-disabled", "");
    } else {
      root.removeAttribute("data-disabled");
    }

    const triggers = root.querySelectorAll('[data-slot="collapsible-trigger"]');
    const contents = root.querySelectorAll('[data-slot="collapsible-content"]');

    triggers.forEach(trigger => {
      if (open) {
        trigger.setAttribute("data-expanded", "");
        trigger.removeAttribute("data-closed");
      } else {
        trigger.removeAttribute("data-expanded");
        trigger.setAttribute("data-closed", "");
      }
      setAttr(trigger, "aria-expanded", open ? "true" : "false");
      if (props.disabled) {
        trigger.setAttribute("disabled", "");
      } else {
        trigger.removeAttribute("disabled");
      }
    });

    contents.forEach(content => {
      if (open) {
        content.setAttribute("data-expanded", "");
        content.removeAttribute("data-closed");
      } else {
        content.removeAttribute("data-expanded");
        content.setAttribute("data-closed", "");
      }
      if (!open && !props.forceMount) {
        content.setAttribute("hidden", "");
      } else {
        content.removeAttribute("hidden");
      }
    });
  }

  function handleTriggerClick(e, triggerCtx) {
    const localOnClick = triggerCtx?.__collapsibleLocalOnClick;
    localOnClick?.(e);
    if (e.defaultPrevented || props.disabled) return;
    ctx.toggle();
    updateAttributes();
  }

  root.addEventListener("click", e => {
    let target = e.target;
    while (target && target !== root) {
      const trigger = target.closest('[data-slot="collapsible-trigger"]');
      if (trigger) {
        // Nested collapsibles (file tree): the same click bubbles to every
        // ancestor root, each of which would toggle itself — clicking a child
        // folder collapsed its parents. Handle it once, at the innermost root.
        e.stopPropagation();
        handleTriggerClick(e, trigger.__collapsibleContext);
        return;
      }
      target = target.parentElement;
    }
  });

  updateAttributes();

  function renderChildren(parent, children) {
    if (typeof children === "function") {
      renderChildren(parent, children());
      return;
    }
    if (children == null || children === false || children === true) return;
    if (Array.isArray(children)) {
      children.forEach(item => renderChildren(parent, item));
      return;
    }
    if (children instanceof Node) {
      parent.appendChild(children);
      return;
    }
    parent.appendChild(document.createTextNode(String(children)));
  }

  renderChildren(root, props.children);

  root.__collapsibleUpdate = updateAttributes;

  return root;
}

function CollapsibleTrigger(props) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("data-slot", "collapsible-trigger");

  if (props.classList) {
    const classes = { ...props.classList };
    if (props.class) classes[props.class] = true;
    el.className = Object.keys(classes).filter(k => !!classes[k]).join(" ");
  } else if (props.class) {
    el.className = props.class;
  }

  function appendNode(parent, value) {
    if (typeof value === "function") {
      appendNode(parent, value());
      return;
    }
    if (value == null || value === false || value === true) return;
    if (Array.isArray(value)) {
      value.forEach(item => appendNode(parent, item));
      return;
    }
    if (value instanceof Node) {
      parent.appendChild(value);
      return;
    }
    parent.appendChild(document.createTextNode(String(value)));
  }

  appendNode(el, props.children);
  el.__collapsibleLocalOnClick = props.onClick;
  return el;
}

function CollapsibleContent(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "collapsible-content");

  if (props.classList) {
    const classes = { ...props.classList };
    if (props.class) classes[props.class] = true;
    el.className = Object.keys(classes).filter(k => !!classes[k]).join(" ");
  } else if (props.class) {
    el.className = props.class;
  }

  function appendNode(parent, value) {
    if (typeof value === "function") {
      appendNode(parent, value());
      return;
    }
    if (value == null || value === false || value === true) return;
    if (Array.isArray(value)) {
      value.forEach(item => appendNode(parent, item));
      return;
    }
    if (value instanceof Node) {
      parent.appendChild(value);
      return;
    }
    parent.appendChild(document.createTextNode(String(value)));
  }

  appendNode(el, props.children);
  return el;
}

function CollapsibleArrow(props) {
  const el = document.createElement("span");
  el.setAttribute("data-component", "collapsible-arrow");
  el.setAttribute("data-slot", "collapsible-arrow");

  if (props?.classList) {
    const classes = { ...props.classList };
    if (props?.class) classes[props.class] = true;
    el.className = Object.keys(classes).filter(k => !!classes[k]).join(" ");
  } else if (props?.class) {
    el.className = props.class;
  }

  const iconWrap = document.createElement("span");
  iconWrap.setAttribute("data-slot", "collapsible-arrow-icon");
  iconWrap.appendChild(renderIcon("chevron-down", "small"));
  el.appendChild(iconWrap);
  return el;
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Arrow: CollapsibleArrow,
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent
});
