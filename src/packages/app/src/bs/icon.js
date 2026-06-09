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

function setAttribute(el, attr, value) {
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

export function Icon(props) {
  const name = props.name,
        size = props.size,
        className = props.class,
        classList = props.classList || {},
        others = { ...props };

  delete others.name;
  delete others.size;
  delete others.class;
  delete others.classList;

  const biClass = iconMap[name] || FALLBACK;

  const el = document.createElement("i");
  el.setAttribute("data-component", "icon");
  el.setAttribute("aria-hidden", "true");
  setAttribute(el, "class", getClassList(classList, className, biClass, size));
  setAttribute(el, "data-size", size || "normal");

  for (const key in others) {
    if (Object.prototype.hasOwnProperty.call(others, key)) {
      setAttribute(el, key, others[key]);
    }
  }

  return el;
}
