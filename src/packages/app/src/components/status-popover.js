import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { Popover } from "@/vendor/ui/components/popover.js";
import { createComponent, createMemo, createRenderEffect, createSignal } from "../lib/reactivity.js";
import { useLanguage } from "@/context/language.js";
import { useServer } from "@/context/server.js";
import { useSync } from "@/context/sync.js";

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Module-level chunk cache replacing lazy(): the dynamic import runs once on
// the first open and the resolved component is reused by later mounts,
// exactly like the lazy() registry did.
let loadedBody;
let bodyLoad;
function loadBody() {
  bodyLoad ??= import("./status-popover-body.js").then(x => {
    loadedBody = x.StatusPopoverBody;
    return loadedBody;
  });
  return bodyLoad;
}

export function StatusPopover() {
  const language = useLanguage();
  const server = useServer();
  const sync = useSync();
  const [shown, setShown] = createSignal(false);
  const [body, setBody] = createSignal(loadedBody);
  const ready = createMemo(() => server.healthy() === false || sync.data?.mcp_ready);
  const healthy = createMemo(() => {
    const serverHealthy = server.healthy() === true;
    const mcp = Object.values(sync.data?.mcp ?? {});
    const issue = mcp.some(item => item.status !== "connected" && item.status !== "disabled");
    return serverHealthy && !issue;
  });

  // Trigger contents: the status icon plus a colored badge dot. Built fresh
  // per evaluation like the compiled IIFE; the badge classes follow the
  // health signals through a render effect owned by the caller's scope.
  const buildTrigger = () => {
    const root = template(`<div class="relative size-4"><div class="badge-mask-tight size-4 d-flex align-items-center justify-content-center"></div><div class="absolute -top-px -right-px size-1.5 rounded-circle"></div></div>`);
    const iconWrap = root.firstElementChild;
    const badge = iconWrap.nextElementSibling;
    iconWrap.appendChild(createComponent(Icon, {
      get name() {
        return shown() ? "status-active" : "status";
      },
      size: "small"
    }));
    createRenderEffect(() => {
      badge.classList.toggle("bg-success", !!(ready() && healthy()));
      badge.classList.toggle("bg-danger", !!(server.healthy() === false || ready() && !healthy()));
      badge.classList.toggle("bg-secondary", !!(server.healthy() === undefined || !ready()));
    });
    return root;
  };

  // Popover content thunk, re-evaluated reactively by the Popover's
  // presence-gated content insert (the established insert() exception).
  // Mirrors Show + Suspense + lazy: nothing while closed, the skeleton while
  // the chunk loads, then the body (remounted fresh on every open).
  const renderBody = () => {
    if (!shown()) return undefined;
    const Body = body();
    if (!Body) {
      void loadBody().then(component => setBody(() => component));
      return template(`<div class="w-[360px] h-14 rounded-3 bg-body shadow-[var(--shadow-lg-border-base)]"></div>`);
    }
    return createComponent(Body, {
      shown: shown
    });
  };

  return createComponent(Popover, {
    get open() {
      return shown();
    },
    onOpenChange: setShown,
    triggerAs: Button,
    get triggerProps() {
      return {
        variant: "ghost",
        class: "titlebar-icon w-8 h-6 p-0 box-border",
        "aria-label": language.t("status.popover.trigger"),
        style: {
          scale: 1
        }
      };
    },
    get trigger() {
      return buildTrigger();
    },
    class: "[&_[data-slot=popover-body]]:p-0 w-[360px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-3",
    gutter: 4,
    placement: "bottom-end",
    shift: -168,
    get children() {
      return renderBody;
    }
  });
}
