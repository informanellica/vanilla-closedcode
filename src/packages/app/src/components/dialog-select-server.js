import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class=px-5><div class="bg-body-tertiary rounded-2 p-5 d-flex flex-column gap-3"><div class="flex-1 min-w-0 [&amp;_[data-slot=input-wrapper]]:relative"></div><div class="grid grid-cols-2 gap-2 min-w-0">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2 -ml-2"><span>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex flex-1 min-h-0 flex-column gap-2"><div class="shrink-0 px-5 pb-5">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-3 min-w-0 flex-1 w-100 group/item"><div class="d-flex flex-column h-full align-items-start w-5"></div><div class="d-flex align-items-center justify-content-center gap-4 pl-4">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span class="text-body bg-body-tertiary px-1.5 rounded-1">`);
import { Button } from "@/bs/button.js";
import { Dialog } from "@/bs/dialog.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { List } from "@/bs/list.js";
import { TextField } from "@/bs/text-field.js";
import { createEffect, createMemo, createResource, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";
import { useLanguage } from "@/context/language.js";
import { ServerConnection } from "@/context/server.js";
import { useServerController } from "@/controllers/server.js";
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
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling;
    _$insert(_el$3, _$createComponent(TextField, {
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
    _$insert(_el$2, _$createComponent(TextField, {
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
    }), _el$4);
    _$insert(_el$4, _$createComponent(TextField, {
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
    }), null);
    _$insert(_el$4, _$createComponent(TextField, {
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
    }), null);
    return _el$;
  })();
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
    return (() => {
      var _el$5 = _tmpl$2(),
        _el$6 = _el$5.firstChild;
      _$insert(_el$5, _$createComponent(IconButton, {
        icon: "arrow-left",
        variant: "ghost",
        onClick: resetForm,
        get ["aria-label"]() {
          return language.t("common.goBack");
        }
      }), _el$6);
      _$insert(_el$6, (() => {
        var _c$ = _$memo(() => !!isAddMode());
        return () => _c$() ? language.t("dialog.server.add.title") : language.t("dialog.server.edit.title");
      })());
      return _el$5;
    })();
  });
  createEffect(() => {
    if (!store.editServer.id) return;
    if (editing()) return;
    resetEdit();
  });
  async function handleRemove(url) {
    await controller.removeServer(url);
  }
  return _$createComponent(Dialog, {
    get title() {
      return formTitle();
    },
    get children() {
      var _el$7 = _tmpl$3(),
        _el$8 = _el$7.firstChild;
      _$insert(_el$7, _$createComponent(Show, {
        get when() {
          return !isFormMode();
        },
        get fallback() {
          return _$createComponent(ServerForm, {
            get value() {
              return _$memo(() => !!isAddMode())() ? store.addServer.url : store.editServer.value;
            },
            get name() {
              return _$memo(() => !!isAddMode())() ? store.addServer.name : store.editServer.name;
            },
            get username() {
              return _$memo(() => !!isAddMode())() ? store.addServer.username : store.editServer.username;
            },
            get password() {
              return _$memo(() => !!isAddMode())() ? store.addServer.password : store.editServer.password;
            },
            get placeholder() {
              return language.t("dialog.server.add.placeholder");
            },
            get busy() {
              return formBusy();
            },
            get error() {
              return _$memo(() => !!isAddMode())() ? store.addServer.error : store.editServer.error;
            },
            get status() {
              return _$memo(() => !!isAddMode())() ? store.addServer.status : store.editServer.status;
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
        },
        get children() {
          return _$createComponent(List, {
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
            children: i => {
              const key = ServerConnection.key(i);
              return (() => {
                var _el$9 = _tmpl$4(),
                  _el$0 = _el$9.firstChild,
                  _el$1 = _el$0.nextSibling;
                _$insert(_el$0, _$createComponent(ServerHealthIndicator, {
                  get health() {
                    return store.status[key];
                  }
                }));
                _$insert(_el$9, _$createComponent(ServerRow, {
                  conn: i,
                  get dimmed() {
                    return store.status[key]?.healthy === false;
                  },
                  get status() {
                    return store.status[key];
                  },
                  "class": "d-flex align-items-center gap-3 min-w-0 flex-1",
                  get badge() {
                    return _$createComponent(Show, {
                      get when() {
                        return defaultKey() === ServerConnection.key(i);
                      },
                      get children() {
                        var _el$10 = _tmpl$5();
                        _$insert(_el$10, () => language.t("dialog.server.status.default"));
                        return _el$10;
                      }
                    });
                  },
                  showCredentials: true
                }), _el$1);
                _$insert(_el$1, _$createComponent(Show, {
                  get when() {
                    return ServerConnection.key(current()) === key;
                  },
                  get children() {
                    return _$createComponent(Icon, {
                      name: "check",
                      "class": "h-6"
                    });
                  }
                }), null);
                _$insert(_el$1, _$createComponent(Show, {
                  get when() {
                    return i.type === "http";
                  },
                  get children() {
                    return _$createComponent(DropdownMenu, {
                      get children() {
                        return [_$createComponent(DropdownMenu.Trigger, {
                          as: IconButton,
                          icon: "dot-grid",
                          variant: "ghost",
                          "class": "shrink-0 size-8",
                          onClick: e => e.stopPropagation(),
                          onPointerDown: e => e.stopPropagation()
                        }), _$createComponent(DropdownMenu.Portal, {
                          get children() {
                            return _$createComponent(DropdownMenu.Content, {
                              "class": "mt-1",
                              get children() {
                                return [_$createComponent(DropdownMenu.Item, {
                                  onSelect: () => {
                                    if (i.type !== "http") return;
                                    startEdit(i);
                                  },
                                  get children() {
                                    return _$createComponent(DropdownMenu.ItemLabel, {
                                      get children() {
                                        return language.t("dialog.server.menu.edit");
                                      }
                                    });
                                  }
                                }), _$createComponent(Show, {
                                  get when() {
                                    return _$memo(() => !!canDefault())() && defaultKey() !== key;
                                  },
                                  get children() {
                                    return _$createComponent(DropdownMenu.Item, {
                                      onSelect: () => setDefault(key),
                                      get children() {
                                        return _$createComponent(DropdownMenu.ItemLabel, {
                                          get children() {
                                            return language.t("dialog.server.menu.default");
                                          }
                                        });
                                      }
                                    });
                                  }
                                }), _$createComponent(Show, {
                                  get when() {
                                    return _$memo(() => !!canDefault())() && defaultKey() === key;
                                  },
                                  get children() {
                                    return _$createComponent(DropdownMenu.Item, {
                                      onSelect: () => setDefault(null),
                                      get children() {
                                        return _$createComponent(DropdownMenu.ItemLabel, {
                                          get children() {
                                            return language.t("dialog.server.menu.defaultRemove");
                                          }
                                        });
                                      }
                                    });
                                  }
                                }), _$createComponent(DropdownMenu.Separator, {}), _$createComponent(DropdownMenu.Item, {
                                  onSelect: () => handleRemove(ServerConnection.key(i)),
                                  "class": "text-danger",
                                  get children() {
                                    return _$createComponent(DropdownMenu.ItemLabel, {
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
                    });
                  }
                }), null);
                return _el$9;
              })();
            }
          });
        }
      }), _el$8);
      _$insert(_el$8, _$createComponent(Show, {
        get when() {
          return isFormMode();
        },
        get fallback() {
          return _$createComponent(Button, {
            variant: "secondary",
            icon: "plus-small",
            size: "large",
            onClick: startAdd,
            "class": "py-1.5 pl-1.5 pr-3 d-flex align-items-center gap-1.5",
            get children() {
              return language.t("dialog.server.add.button");
            }
          });
        },
        get children() {
          return _$createComponent(Button, {
            variant: "primary",
            size: "large",
            onClick: submitForm,
            get disabled() {
              return formBusy();
            },
            "class": "px-3 py-1.5",
            get children() {
              return _$memo(() => !!formBusy())() ? language.t("dialog.server.add.checking") : _$memo(() => !!isAddMode())() ? language.t("dialog.server.add.button") : language.t("common.save");
            }
          });
        }
      }));
      return _el$7;
    }
  });
}