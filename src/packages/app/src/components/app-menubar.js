import { createComponent } from "../lib/reactivity.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Build the static menu definition. Each item's `action` resolves a prop
// callback lazily at click-time so optional callbacks can be guarded with ?.().
function buildMenus(props) {
  return [
    {
      id: "file",
      label: "ファイル",
      icon: "folder",
      items: [
        { id: "new-session", label: "新しいセッション", icon: "new-session", action: () => props.onNewSession?.() },
        { id: "open-project", label: "プロジェクトを開く", icon: "folder", action: () => props.onOpenProject?.() },
        { id: "settings", label: "設定", icon: "settings-gear", action: () => props.onOpenSettings?.() }
      ]
    },
    {
      id: "edit",
      label: "編集",
      icon: "pencil-line",
      items: [
        { id: "undo", label: "元に戻す", icon: "reset", action: () => props.onUndo?.() },
        { id: "redo", label: "やり直し", icon: "arrow-undo-down", action: () => props.onRedo?.() },
        { id: "cut", label: "切り取り", icon: "scissors", action: () => props.onCut?.() },
        { id: "copy", label: "コピー", icon: "copy", action: () => props.onCopy?.() },
        { id: "paste", label: "貼り付け", icon: "clipboard", action: () => props.onPaste?.() }
      ]
    },
    {
      id: "view",
      label: "表示",
      icon: "eye",
      items: [
        { id: "toggle-sidebar", label: "サイドバー切替", icon: "sidebar", action: () => props.onToggleSidebar?.() }
      ]
    },
    {
      id: "server",
      label: "サーバー",
      icon: "server",
      items: [
        { id: "open-server", label: "サーバーを管理", icon: "server", action: () => props.onOpenServer?.() }
      ]
    },
    {
      id: "help",
      label: "ヘルプ",
      icon: "help",
      items: [
        { id: "help", label: "ヘルプ", icon: "help", action: () => props.onHelp?.() }
      ]
    }
  ];
}

function Menu(props) {
  // props.menu is a static definition built once in AppMenubar — the trigger
  // label/icon and the item list never change after creation, so everything
  // below is decided at build time (no effects needed).
  return createComponent(DropdownMenu, {
    "class": "nav-item",
    get children() {
      // Built lazily through the children getter so Trigger/Content mount
      // inside this DropdownMenu's context (the bs root exposes its state
      // only while it appends its own children).
      return [
        createComponent(DropdownMenu.Trigger, {
          as: "a",
          "class": "p-0 border-0 bg-transparent",
          get children() {
            const trigger = template(`<span class="nav-link px-2 py-1 d-flex align-items-center gap-1"></span>`);
            trigger.setAttribute("title", props.menu.label);
            trigger.setAttribute("aria-label", props.menu.label);
            trigger.appendChild(createComponent(Icon, { name: props.menu.icon }));
            return trigger;
          }
        }),
        createComponent(DropdownMenu.Content, {
          get children() {
            // For(props.menu.items): the list is static — map once.
            return props.menu.items.map(item =>
              createComponent(DropdownMenu.Item, {
                onSelect: () => item.action?.(),
                get children() {
                  const children = [];
                  // Show(item.icon): static per item — decide once at build.
                  if (item.icon) {
                    children.push(createComponent(DropdownMenu.Icon, {
                      get children() {
                        return createComponent(Icon, { name: item.icon });
                      }
                    }));
                  }
                  const label = template(`<span class="flex-grow-1"></span>`);
                  label.textContent = item.label;
                  children.push(label);
                  return children;
                }
              })
            );
          }
        })
      ];
    }
  });
}

export function AppMenubar(props) {
  const menus = buildMenus(props);
  const bar = template(`<nav data-component="app-menubar" class="d-flex align-items-center"><ul data-slot="menus" class="navbar-nav flex-row mb-0"></ul></nav>`);
  // Named slot instead of positional firstElementChild (guide: insertion by
  // querySelector("[data-slot=…]"), not positional wiring).
  const list = bar.querySelector("[data-slot=menus]");
  // For(menus): the menu set is static — append one dropdown per definition.
  for (const menu of menus) {
    list.appendChild(createComponent(Menu, { menu: menu }));
  }
  return bar;
}
