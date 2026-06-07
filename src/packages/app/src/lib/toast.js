import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { Portal } from "solid-js/web";
import { For, Show, createSignal, splitProps } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";

// Local, self-contained replacement for ui/toast.
//
// The original was a thin wrapper over @kobalte/core/toast. To avoid pulling in
// any ui (and its Kobalte) dependency, we reimplement a minimal
// toaster store with the same public JS API (showToast/showPromiseToast/toaster
// and the `Toast` component namespace). The visual host uses Bootstrap toast
// markup (.toast-container / .toast). Icons come from @/bs/icon.js.

var _tmplRegion$ = /*#__PURE__*/_$template(
  `<div data-component=toast-region class="toast-container position-fixed bottom-0 end-0 p-3"><ul data-slot=toast-list class="list-unstyled m-0 d-flex flex-column gap-2">`,
);
var _tmplItem$ = /*#__PURE__*/_$template(`<li>`);
var _tmplRoot$ = /*#__PURE__*/_$template(
  `<div data-component=toast role=alert aria-live=assertive aria-atomic=true class="toast show d-flex align-items-start gap-2 p-3" style="--bs-toast-bg:var(--bs-body-bg)">`,
);
var _tmplIcon$ = /*#__PURE__*/_$template(`<div data-slot=toast-icon class="flex-shrink-0">`);
var _tmplContent$ = /*#__PURE__*/_$template(`<div data-slot=toast-content class="flex-grow-1 min-w-0">`);
var _tmplTitle$ = /*#__PURE__*/_$template(`<div data-slot=toast-title class="fw-medium">`);
var _tmplDescription$ = /*#__PURE__*/_$template(`<div data-slot=toast-description class="text-body-secondary">`);
var _tmplActions$ = /*#__PURE__*/_$template(`<div data-slot=toast-actions class="d-flex flex-wrap gap-3 mt-2">`);
var _tmplAction$ = /*#__PURE__*/_$template(`<button type=button data-slot=toast-action class="btn btn-link p-0">`);
var _tmplProgressTrack$ = /*#__PURE__*/_$template(`<div data-slot=toast-progress-track class="progress">`);
var _tmplProgressFill$ = /*#__PURE__*/_$template(`<div data-slot=toast-progress-fill class="progress-bar">`);

// --- toaster store -------------------------------------------------------

const [toasts, setToasts] = createStore([]);
let nextId = 0;

function add(render, options = {}) {
  const id = nextId++;
  setToasts(
    produce(list => {
      list.push({ id, render, duration: options.duration, persistent: options.persistent });
    }),
  );
  const persistent = options.persistent;
  const duration = options.duration ?? 5000;
  if (!persistent && duration > 0 && duration !== Infinity) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id) {
  setToasts(list => list.filter(t => t.id !== id));
  return id;
}

function clear() {
  setToasts([]);
}

function update(id, render) {
  setToasts(t => t.id === id, "render", () => render);
  return id;
}

function show(render, options) {
  return add(render, options);
}

function promise(promiseOrFn, render, options) {
  const id = nextId++;
  const [state, setState] = createSignal("pending");
  const [data, setData] = createSignal(undefined);
  const [error, setError] = createSignal(undefined);
  const renderWrapper = props =>
    render({
      get toastId() {
        return id;
      },
      get state() {
        return state();
      },
      get data() {
        return data();
      },
      get error() {
        return error();
      },
      ...props,
    });
  setToasts(
    produce(list => {
      list.push({ id, render: renderWrapper, persistent: true });
    }),
  );
  const p = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
  Promise.resolve(p).then(
    value => {
      setData(() => value);
      setState("fulfilled");
      const d = options?.duration ?? 5000;
      if (d > 0 && d !== Infinity) setTimeout(() => dismiss(id), d);
    },
    err => {
      setError(() => err);
      setState("rejected");
      const d = options?.duration ?? 5000;
      if (d > 0 && d !== Infinity) setTimeout(() => dismiss(id), d);
    },
  );
  return id;
}

export const toaster = {
  show,
  dismiss,
  update,
  clear,
  promise,
};

// --- Toast component namespace ------------------------------------------

function ToastRegion(props) {
  return _$createComponent(Portal, {
    get children() {
      var _el$ = _tmplRegion$(),
        _list$ = _el$.firstChild;
      _$spread(
        _el$,
        _$mergeProps(
          {
            "data-component": "toast-region",
          },
          props,
        ),
        false,
        true,
      );
      _$insert(
        _list$,
        _$createComponent(For, {
          get each() {
            return toasts;
          },
          children: toast => {
            var _item$ = _tmplItem$();
            _$insert(_item$, () => toast.render({ toastId: toast.id }));
            return _item$;
          },
        }),
      );
      return _el$;
    },
  });
}

function ToastRoot(props) {
  return (() => {
    var _el$ = _tmplRoot$();
    _$spread(_el$, props, false, false);
    _$effect(() => _$setAttribute(_el$, "data-variant", props["data-variant"] ?? "default"));
    return _el$;
  })();
}

function ToastIcon(props) {
  return (() => {
    var _el$ = _tmplIcon$();
    _$insert(
      _el$,
      _$createComponent(Icon, {
        get name() {
          return props.name;
        },
      }),
    );
    return _el$;
  })();
}

function ToastContent(props) {
  return (() => {
    var _el$ = _tmplContent$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
}

function ToastTitle(props) {
  return (() => {
    var _el$ = _tmplTitle$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
}

function ToastDescription(props) {
  return (() => {
    var _el$ = _tmplDescription$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
}

function ToastActions(props) {
  return (() => {
    var _el$ = _tmplActions$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
}

function ToastCloseButton(props) {
  const [local, others] = splitProps(props, ["onClick"]);
  return _$createComponent(IconButton, _$mergeProps({
    "data-slot": "toast-close-button",
    icon: "close",
    variant: "ghost",
    "aria-label": "Dismiss",
    get onClick() {
      return local.onClick;
    },
  }, others));
}

function ToastProgressTrack(props) {
  return (() => {
    var _el$ = _tmplProgressTrack$();
    _$spread(_el$, props, false, false);
    return _el$;
  })();
}

function ToastProgressFill(props) {
  return (() => {
    var _el$ = _tmplProgressFill$();
    _$spread(_el$, props, false, false);
    return _el$;
  })();
}

export const Toast = Object.assign(ToastRoot, {
  Region: ToastRegion,
  Icon: ToastIcon,
  Content: ToastContent,
  Title: ToastTitle,
  Description: ToastDescription,
  Actions: ToastActions,
  CloseButton: ToastCloseButton,
  ProgressTrack: ToastProgressTrack,
  ProgressFill: ToastProgressFill,
});

export function showToast(options) {
  const opts = typeof options === "string" ? { description: options } : options;
  let toastId;
  toastId = toaster.show(
    props =>
      _$createComponent(Toast, {
        get toastId() {
          return props.toastId;
        },
        get duration() {
          return opts.duration;
        },
        get persistent() {
          return opts.persistent;
        },
        get ["data-variant"]() {
          return opts.variant ?? "default";
        },
        get children() {
          return [
            _$createComponent(Show, {
              get when() {
                return opts.icon;
              },
              get children() {
                return _$createComponent(Toast.Icon, {
                  get name() {
                    return opts.icon;
                  },
                });
              },
            }),
            _$createComponent(Toast.Content, {
              get children() {
                return [
                  _$createComponent(Show, {
                    get when() {
                      return opts.title;
                    },
                    get children() {
                      return _$createComponent(Toast.Title, {
                        get children() {
                          return opts.title;
                        },
                      });
                    },
                  }),
                  _$createComponent(Show, {
                    get when() {
                      return opts.description;
                    },
                    get children() {
                      return _$createComponent(Toast.Description, {
                        get children() {
                          return opts.description;
                        },
                      });
                    },
                  }),
                  _$createComponent(Show, {
                    get when() {
                      return opts.actions?.length;
                    },
                    get children() {
                      return _$createComponent(Toast.Actions, {
                        get children() {
                          return opts.actions.map(action =>
                            (() => {
                              var _el$ = _tmplAction$();
                              // Bootstrap button styled by the action's variant
                              // (danger / primary / secondary); default = link.
                              _el$.className = action.variant
                                ? "btn btn-sm btn-" + action.variant
                                : "btn btn-link p-0";
                              _el$.$$click = () => {
                                if (typeof action.onClick === "function") {
                                  action.onClick();
                                }
                                toaster.dismiss(props.toastId);
                              };
                              _$insert(_el$, () => action.label);
                              return _el$;
                            })(),
                          );
                        },
                      });
                    },
                  }),
                ];
              },
            }),
            _$createComponent(Toast.CloseButton, {
              onClick: () => toaster.dismiss(props.toastId),
            }),
          ];
        },
      }),
    { duration: opts.duration, persistent: opts.persistent },
  );
  return toastId;
}

export function showPromiseToast(promise, options) {
  return toaster.promise(promise, props =>
    _$createComponent(Toast, {
      get toastId() {
        return props.toastId;
      },
      get ["data-variant"]() {
        return props.state === "pending" ? "loading" : props.state === "fulfilled" ? "success" : "error";
      },
      get children() {
        return [
          _$createComponent(Toast.Content, {
            get children() {
              return _$createComponent(Toast.Description, {
                get children() {
                  return [
                    () => props.state === "pending" && options.loading,
                    () => props.state === "fulfilled" && options.success?.(props.data),
                    () => props.state === "rejected" && options.error?.(props.error),
                  ];
                },
              });
            },
          }),
          _$createComponent(Toast.CloseButton, {
            onClick: () => toaster.dismiss(props.toastId),
          }),
        ];
      },
    }),
  );
}

_$delegateEvents(["click"]);
