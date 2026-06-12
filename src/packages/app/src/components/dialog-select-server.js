import { Button } from "@/bs/button.js";
import { Dialog } from "@/bs/dialog.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { List } from "@/bs/list.js";
import { TextField } from "@/bs/text-field.js";
import { Show, createComponent, createEffect, createMemo, createRenderEffect, createResource, onCleanup, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";
import { useLanguage } from "@/context/language.js";
import { ServerConnection } from "@/context/server.js";
import { useServerController } from "@/controllers/server.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
const DEFAULT_USERNAME = "closedcode";
function useDefaultServer(controller) {
  const [defaultKey, defaultUrlActions] = createResource(async () => {
    const key = await controller.getDefault();
    return key ?? null;
  }, {
    initialValue: null
  });
  const setDefault = async key => {
    try {
      await controller.setDefault(key);
      defaultUrlActions.mutate(key);
    } catch {
      // controller already surfaced the error
    }
  };
  return {
    defaultKey,
    canDefault: controller.canDefault,
    setDefault
  };
}
function ServerForm(props) {
  const language = useLanguage();
  const keyDown = event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      props.onBack();
      return;
    }
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    props.onSubmit();
  };
  // Static skeleton (_tmpl$): card with the URL field host, the name field
  // placed between it and a two-column grid hosting username/password.
  const root = template(`<div class="px-5"><div class="bg-body-tertiary rounded-2 p-5 d-flex flex-column gap-3"><div class="flex-1 min-w-0 [&amp;_[data-slot=input-wrapper]]:relative"></div><div class="grid grid-cols-2 gap-2 min-w-0"></div></div></div>`);
  const card = root.firstChild;
  const urlHost = card.firstChild;
  const grid = urlHost.nextSibling;
  urlHost.appendChild(createComponent(TextField, {
    type: "text",
    get label() {
      return language.t("dialog.server.add.url");
    },
    get placeholder() {
      return props.placeholder;
    },
    get value() {
      return props.value;
    },
    autofocus: true,
    get validationState() {
      return props.error ? "invalid" : "valid";
    },
    get error() {
      return props.error;
    },
    get disabled() {
      return props.busy;
    },
    get onChange() {
      return props.onChange;
    },
    onKeyDown: keyDown
  }));
  card.insertBefore(createComponent(TextField, {
    type: "text",
    get label() {
      return language.t("dialog.server.add.name");
    },
    get placeholder() {
      return language.t("dialog.server.add.namePlaceholder");
    },
    get value() {
      return props.name;
    },
    get disabled() {
      return props.busy;
    },
    get onChange() {
      return props.onNameChange;
    },
    onKeyDown: keyDown
  }), grid);
  grid.appendChild(createComponent(TextField, {
    type: "text",
    get label() {
      return language.t("dialog.server.add.username");
    },
    get placeholder() {
      return language.t("dialog.server.add.usernamePlaceholder");
    },
    get value() {
      return props.username;
    },
    get disabled() {
      return props.busy;
    },
    get onChange() {
      return props.onUsernameChange;
    },
    onKeyDown: keyDown
  }));
  grid.appendChild(createComponent(TextField, {
    type: "password",
    get label() {
      return language.t("dialog.server.add.password");
    },
    get placeholder() {
      return language.t("dialog.server.add.passwordPlaceholder");
    },
    get value() {
      return props.password;
    },
    get disabled() {
      return props.busy;
    },
    get onChange() {
      return props.onPasswordChange;
    },
    onKeyDown: keyDown
  }));
  return root;
}
export function DialogSelectServer() {
  const language = useLanguage();
  const controller = useServerController();
  const server = controller.server;
  const {
    defaultKey,
    canDefault,
    setDefault
  } = useDefaultServer(controller);
  const addMutation = controller.addMutation;
  const editMutation = controller.editMutation;
  const previewStatus = (value, username, password, setStatus) => {
    setStatus(undefined);
    void controller.previewStatus(value, username, password).then(status => setStatus(status));
  };
  const [store, setStore] = createStore({
    status: {},
    addServer: {
      url: "",
      name: "",
      username: DEFAULT_USERNAME,
      password: "",
      error: "",
      showForm: false,
      status: undefined
    },
    editServer: {
      id: undefined,
      value: "",
      name: "",
      username: "",
      password: "",
      error: "",
      status: undefined
    }
  });
  const resetAdd = () => {
    setStore("addServer", {
      url: "",
      name: "",
      username: DEFAULT_USERNAME,
      password: "",
      error: "",
      showForm: false,
      status: undefined
    });
  };
  const resetEdit = () => {
    setStore("editServer", {
      id: undefined,
      value: "",
      name: "",
      username: "",
      password: "",
      error: "",
      status: undefined
    });
  };
  const items = createMemo(() => {
    const current = server.current;
    const list = server.list;
    if (!current) return list;
    if (!list.includes(current)) return [current, ...list];
    return [current, ...list.filter(x => x !== current)];
  });
  const current = createMemo(() => items().find(x => ServerConnection.key(x) === server.key) ?? items()[0]);
  const sortedItems = createMemo(() => {
    const list = items();
    if (!list.length) return list;
    const active = current();
    const order = new Map(list.map((url, index) => [url, index]));
    const rank = value => {
      if (value?.healthy === true) return 0;
      if (value?.healthy === false) return 2;
      return 1;
    };
    return list.slice().sort((a, b) => {
      if (a === active) return -1;
      if (b === active) return 1;
      const diff = rank(store.status[ServerConnection.key(a)]) - rank(store.status[ServerConnection.key(b)]);
      if (diff !== 0) return diff;
      return (order.get(a) ?? 0) - (order.get(b) ?? 0);
    });
  });
  async function refreshHealth() {
    const results = {};
    await Promise.all(items().map(async conn => {
      results[ServerConnection.key(conn)] = await controller.checkHealth(conn.http);
    }));
    setStore("status", reconcile(results));
  }
  createEffect(() => {
    items();
    void refreshHealth();
    const interval = setInterval(refreshHealth, 10_000);
    onCleanup(() => clearInterval(interval));
  });
  async function select(conn, persist) {
    const knownHealthy = store.status[ServerConnection.key(conn)]?.healthy;
    await controller.select(conn, persist, knownHealthy);
  }
  const handleAddChange = value => {
    if (addMutation.isPending) return;
    setStore("addServer", {
      url: value,
      error: ""
    });
    void previewStatus(value, store.addServer.username, store.addServer.password, next => setStore("addServer", {
      status: next
    }));
  };
  const handleAddNameChange = value => {
    if (addMutation.isPending) return;
    setStore("addServer", {
      name: value,
      error: ""
    });
  };
  const handleAddUsernameChange = value => {
    if (addMutation.isPending) return;
    setStore("addServer", {
      username: value,
      error: ""
    });
    void previewStatus(store.addServer.url, value, store.addServer.password, next => setStore("addServer", {
      status: next
    }));
  };
  const handleAddPasswordChange = value => {
    if (addMutation.isPending) return;
    setStore("addServer", {
      password: value,
      error: ""
    });
    void previewStatus(store.addServer.url, store.addServer.username, value, next => setStore("addServer", {
      status: next
    }));
  };
  const handleEditChange = value => {
    if (editMutation.isPending) return;
    setStore("editServer", {
      value,
      error: ""
    });
    void previewStatus(value, store.editServer.username, store.editServer.password, next => setStore("editServer", {
      status: next
    }));
  };
  const handleEditNameChange = value => {
    if (editMutation.isPending) return;
    setStore("editServer", {
      name: value,
      error: ""
    });
  };
  const handleEditUsernameChange = value => {
    if (editMutation.isPending) return;
    setStore("editServer", {
      username: value,
      error: ""
    });
    void previewStatus(store.editServer.value, value, store.editServer.password, next => setStore("editServer", {
      status: next
    }));
  };
  const handleEditPasswordChange = value => {
    if (editMutation.isPending) return;
    setStore("editServer", {
      password: value,
      error: ""
    });
    void previewStatus(store.editServer.value, store.editServer.username, value, next => setStore("editServer", {
      status: next
    }));
  };
  const mode = createMemo(() => {
    if (store.editServer.id) return "edit";
    if (store.addServer.showForm) return "add";
    return "list";
  });
  const editing = createMemo(() => {
    if (!store.editServer.id) return;
    return items().find(x => x.type === "http" && x.http.url === store.editServer.id);
  });
  const resetForm = () => {
    resetAdd();
    resetEdit();
  };
  const startAdd = () => {
    resetEdit();
    setStore("addServer", {
      showForm: true,
      url: "",
      name: "",
      username: DEFAULT_USERNAME,
      password: "",
      error: "",
      status: undefined
    });
  };
  const startEdit = conn => {
    resetAdd();
    setStore("editServer", {
      id: conn.http.url,
      value: conn.http.url,
      name: conn.displayName ?? "",
      username: conn.http.username ?? "",
      password: conn.http.password ?? "",
      error: "",
      status: store.status[ServerConnection.key(conn)]?.healthy
    });
  };
  const submitForm = () => {
    if (mode() === "add") {
      if (addMutation.isPending) return;
      setStore("addServer", {
        error: ""
      });
      void addMutation.mutateAsync({
        url: store.addServer.url,
        name: store.addServer.name,
        username: store.addServer.username,
        password: store.addServer.password
      }).then(result => {
        if (result?.ok === false) {
          setStore("addServer", {
            error: result.error
          });
          return;
        }
        resetAdd();
      });
      return;
    }
    const original = editing();
    if (!original) return;
    if (editMutation.isPending) return;
    setStore("editServer", {
      error: ""
    });
    void editMutation.mutateAsync({
      original,
      value: store.editServer.value,
      name: store.editServer.name,
      username: store.editServer.username,
      password: store.editServer.password
    }).then(result => {
      if (result?.ok === false) {
        setStore("editServer", {
          error: result.error
        });
        return;
      }
      resetEdit();
    });
  };
  const isFormMode = createMemo(() => mode() !== "list");
  const isAddMode = createMemo(() => mode() === "add");
  const formBusy = createMemo(() => isAddMode() ? addMutation.isPending : editMutation.isPending);
  const formTitle = createMemo(() => {
    if (!isFormMode()) return language.t("dialog.server.title");
    // Form-mode title (_tmpl$2): back button + add/edit label. The label text
    // tracks both the add/edit mode and the language.
    const titleEl = template(`<div class="d-flex align-items-center gap-2 -ml-2"><span></span></div>`);
    const label = titleEl.firstChild;
    titleEl.insertBefore(createComponent(IconButton, {
      icon: "arrow-left",
      variant: "ghost",
      onClick: resetForm,
      get ["aria-label"]() {
        return language.t("common.goBack");
      }
    }), label);
    createRenderEffect(() => {
      label.textContent = isAddMode() ? language.t("dialog.server.add.title") : language.t("dialog.server.edit.title");
    });
    return titleEl;
  });
  createEffect(() => {
    if (!store.editServer.id) return;
    if (editing()) return;
    resetEdit();
  });
  async function handleRemove(url) {
    await controller.removeServer(url);
  }
  // Row renderer for the server list (compiled _tmpl$4 subtree): health dot,
  // server row with optional default badge, active check mark and the row menu.
  const renderServerRow = i => {
    const key = ServerConnection.key(i);
    const row = template(`<div class="d-flex align-items-center gap-3 min-w-0 flex-1 w-100 group/item"><div class="d-flex flex-column h-full align-items-start w-5"></div><div class="d-flex align-items-center justify-content-center gap-4 pl-4"></div></div>`);
    const healthHost = row.firstChild;
    const actions = healthHost.nextSibling;
    healthHost.appendChild(createComponent(ServerHealthIndicator, {
      get health() {
        return store.status[key];
      }
    }));
    row.insertBefore(createComponent(ServerRow, {
      conn: i,
      get dimmed() {
        return store.status[key]?.healthy === false;
      },
      get status() {
        return store.status[key];
      },
      "class": "d-flex align-items-center gap-3 min-w-0 flex-1",
      get badge() {
        // Default-server badge (_tmpl$5); ServerRow resolves this accessor
        // reactively, and the badge text stays live across language switches.
        return createComponent(Show, {
          get when() {
            return defaultKey() === ServerConnection.key(i);
          },
          get children() {
            const badgeEl = template(`<span class="text-body bg-body-tertiary px-1.5 rounded-1"></span>`);
            createRenderEffect(() => {
              badgeEl.textContent = language.t("dialog.server.status.default");
            });
            return badgeEl;
          }
        });
      },
      showCredentials: true
    }), actions);
    // Check mark on the active server (Show, non-keyed): the marker text node
    // keeps the icon's position before the row menu, like insert()'s
    // placeholder; the icon is rebuilt on each falsy-to-truthy flip.
    const checkMarker = document.createTextNode("");
    actions.appendChild(checkMarker);
    const isCurrent = createMemo(() => ServerConnection.key(current()) === key);
    let checkEl = null;
    createRenderEffect(() => {
      if (isCurrent()) {
        if (!checkEl) {
          checkEl = createComponent(Icon, {
            name: "check",
            "class": "h-6"
          });
          actions.insertBefore(checkEl, checkMarker);
        }
        return;
      }
      if (checkEl) {
        checkEl.remove();
        checkEl = null;
      }
    });
    // Row menu (Show when i.type === "http" — static per item, so a plain if).
    // The default/defaultRemove entries stay Show components: the vanilla
    // DropdownMenu resolves reactive function children itself.
    if (i.type === "http") {
      actions.appendChild(createComponent(DropdownMenu, {
        get children() {
          return [createComponent(DropdownMenu.Trigger, {
            as: IconButton,
            icon: "dot-grid",
            variant: "ghost",
            "class": "shrink-0 size-8",
            onClick: e => e.stopPropagation(),
            onPointerDown: e => e.stopPropagation()
          }), createComponent(DropdownMenu.Portal, {
            get children() {
              return createComponent(DropdownMenu.Content, {
                "class": "mt-1",
                get children() {
                  return [createComponent(DropdownMenu.Item, {
                    onSelect: () => {
                      if (i.type !== "http") return;
                      startEdit(i);
                    },
                    get children() {
                      return createComponent(DropdownMenu.ItemLabel, {
                        get children() {
                          return language.t("dialog.server.menu.edit");
                        }
                      });
                    }
                  }), createComponent(Show, {
                    get when() {
                      return !!canDefault() && defaultKey() !== key;
                    },
                    get children() {
                      return createComponent(DropdownMenu.Item, {
                        onSelect: () => setDefault(key),
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              return language.t("dialog.server.menu.default");
                            }
                          });
                        }
                      });
                    }
                  }), createComponent(Show, {
                    get when() {
                      return !!canDefault() && defaultKey() === key;
                    },
                    get children() {
                      return createComponent(DropdownMenu.Item, {
                        onSelect: () => setDefault(null),
                        get children() {
                          return createComponent(DropdownMenu.ItemLabel, {
                            get children() {
                              return language.t("dialog.server.menu.defaultRemove");
                            }
                          });
                        }
                      });
                    }
                  }), createComponent(DropdownMenu.Separator, {}), createComponent(DropdownMenu.Item, {
                    onSelect: () => handleRemove(ServerConnection.key(i)),
                    "class": "text-danger",
                    get children() {
                      return createComponent(DropdownMenu.ItemLabel, {
                        get children() {
                          return language.t("dialog.server.menu.delete");
                        }
                      });
                    }
                  })];
                }
              });
            }
          })];
        }
      }));
    }
    return row;
  };
  // List branch of the main Show (list mode).
  const renderList = () => createComponent(List, {
    get search() {
      return {
        placeholder: language.t("dialog.server.search.placeholder"),
        autofocus: false
      };
    },
    noInitialSelection: true,
    get emptyMessage() {
      return language.t("dialog.server.empty");
    },
    items: sortedItems,
    key: x => x.http.url,
    onSelect: x => {
      if (x) void select(x);
    },
    divider: true,
    "class": "flex-1 min-h-0 px-5 [&_[data-slot=list-search-wrapper]]:w-full [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:overflow-y-auto [&_[data-slot=list-items]]:bg-body-tertiary [&_[data-slot=list-items]]:rounded-md [&_[data-slot=list-item]]:min-h-14 [&_[data-slot=list-item]]:p-3 [&_[data-slot=list-item]]:!bg-transparent",
    children: renderServerRow
  });
  // Form branch of the main Show (add/edit mode).
  const renderForm = () => createComponent(ServerForm, {
    get value() {
      return isAddMode() ? store.addServer.url : store.editServer.value;
    },
    get name() {
      return isAddMode() ? store.addServer.name : store.editServer.name;
    },
    get username() {
      return isAddMode() ? store.addServer.username : store.editServer.username;
    },
    get password() {
      return isAddMode() ? store.addServer.password : store.editServer.password;
    },
    get placeholder() {
      return language.t("dialog.server.add.placeholder");
    },
    get busy() {
      return formBusy();
    },
    get error() {
      return isAddMode() ? store.addServer.error : store.editServer.error;
    },
    get status() {
      return isAddMode() ? store.addServer.status : store.editServer.status;
    },
    get onChange() {
      return isAddMode() ? handleAddChange : handleEditChange;
    },
    get onNameChange() {
      return isAddMode() ? handleAddNameChange : handleEditNameChange;
    },
    get onUsernameChange() {
      return isAddMode() ? handleAddUsernameChange : handleEditUsernameChange;
    },
    get onPasswordChange() {
      return isAddMode() ? handleAddPasswordChange : handleEditPasswordChange;
    },
    onSubmit: submitForm,
    onBack: resetForm
  });
  // Footer buttons: "add server" in list mode, submit in form mode. The
  // vanilla Button reads its children once, so each rebuild snapshots the
  // current label — same cadence as the compiled Show fallback/children.
  const renderAddButton = () => createComponent(Button, {
    variant: "secondary",
    icon: "plus-small",
    size: "large",
    onClick: startAdd,
    "class": "py-1.5 pl-1.5 pr-3 d-flex align-items-center gap-1.5",
    get children() {
      return language.t("dialog.server.add.button");
    }
  });
  const renderSubmitButton = () => createComponent(Button, {
    variant: "primary",
    size: "large",
    onClick: submitForm,
    get disabled() {
      return formBusy();
    },
    "class": "px-3 py-1.5",
    get children() {
      return formBusy() ? language.t("dialog.server.add.checking") : isAddMode() ? language.t("dialog.server.add.button") : language.t("common.save");
    }
  });
  return createComponent(Dialog, {
    get title() {
      return formTitle();
    },
    get children() {
      // Static skeleton (_tmpl$3): content above the footer. The
      // display:contents wrapper hosts the swapped branch without adding a
      // flex item, so the layout matches the compiled marker-based insert().
      const body = template(`<div class="d-flex flex-1 min-h-0 flex-column gap-2"><div style="display:contents"></div><div class="shrink-0 px-5 pb-5"></div></div>`);
      const contentSlot = body.firstChild;
      const footer = contentSlot.nextSibling;
      // Show over isFormMode() (a boolean memo): these effects re-run only on
      // mode flips; untrack keeps component construction out of the deps,
      // mirroring createComponent's untracked evaluation under Show.
      createRenderEffect(() => {
        const form = isFormMode();
        contentSlot.replaceChildren(untrack(() => (form ? renderForm() : renderList())));
      });
      createRenderEffect(() => {
        const form = isFormMode();
        footer.replaceChildren(untrack(() => (form ? renderSubmitButton() : renderAddButton())));
      });
      return body;
    }
  });
}