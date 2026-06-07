import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { For, Show } from "solid-js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";

var _tmplBar$ = /*#__PURE__*/_$template(`<nav data-component=app-menubar class="d-flex align-items-center"><ul class="navbar-nav flex-row mb-0">`);
var _tmplTrigger$ = /*#__PURE__*/_$template(`<span class="nav-link px-2 py-1 d-flex align-items-center gap-1">`);
var _tmplItemLabel$ = /*#__PURE__*/_$template(`<span class="flex-grow-1">`);

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
  return _$createComponent(DropdownMenu, {
    "class": "nav-item",
    get children() {
      return [
        _$createComponent(DropdownMenu.Trigger, {
          as: "a",
          "class": "p-0 border-0 bg-transparent",
          get children() {
            var _trig = _tmplTrigger$();
            _trig.setAttribute("title", props.menu.label);
            _trig.setAttribute("aria-label", props.menu.label);
            _$insert(_trig, _$createComponent(Icon, {
              get name() {
                return props.menu.icon;
              }
            }));
            return _trig;
          }
        }),
        _$createComponent(DropdownMenu.Content, {
          get children() {
            return _$createComponent(For, {
              get each() {
                return props.menu.items;
              },
              children: item =>
                _$createComponent(DropdownMenu.Item, {
                  onSelect: () => item.action?.(),
                  get children() {
                    return [
                      _$createComponent(Show, {
                        get when() {
                          return item.icon;
                        },
                        get children() {
                          return _$createComponent(DropdownMenu.Icon, {
                            get children() {
                              return _$createComponent(Icon, {
                                get name() {
                                  return item.icon;
                                }
                              });
                            }
                          });
                        }
                      }),
                      (() => {
                        var _lbl = _tmplItemLabel$();
                        _$insert(_lbl, () => item.label);
                        return _lbl;
                      })()
                    ];
                  }
                })
            });
          }
        })
      ];
    }
  });
}

export function AppMenubar(props) {
  const menus = buildMenus(props);
  return (() => {
    var _bar = _tmplBar$(),
      _list = _bar.firstChild;
    _$insert(
      _list,
      _$createComponent(For, {
        each: menus,
        children: menu => _$createComponent(Menu, { menu: menu })
      })
    );
    return _bar;
  })();
}
