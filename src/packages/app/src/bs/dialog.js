import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { className as _$className } from "solid-js/web";
var _tmplModal$ = /*#__PURE__*/_$template(`<div data-component=dialog class="modal fade" tabindex=-1><div data-slot=dialog-container class="modal-dialog modal-dialog-scrollable modal-dialog-centered"><div class="modal-content" data-slot=dialog-content>`),
  _tmplHeader$ = /*#__PURE__*/_$template(`<div class="modal-header d-flex align-items-center" data-slot=dialog-header><h5 class="modal-title text-truncate mb-0" data-slot=dialog-title></h5><div class="ms-auto d-flex align-items-center" data-slot=dialog-header-action>`),
  _tmplDesc$ = /*#__PURE__*/_$template(`<div class="px-3 pt-2 text-secondary small" data-slot=dialog-description>`),
  _tmplBody$ = /*#__PURE__*/_$template(`<div class="modal-body d-flex flex-column" data-slot=dialog-body>`);
import { Match, Show, Switch, onMount, onCleanup } from "solid-js";
import { IconButton } from "@/bs/icon-button.js";

// Real Bootstrap Modal. Renders proper `.modal` markup and drives it with
// window.bootstrap.Modal (loaded as a classic bundle in index.html), so the
// backdrop, focus-trap, ESC-to-close and body scroll-lock are handled by
// Bootstrap's JS. The surrounding DialogProvider/useDialog still owns the
// portal + disposal; we signal it to dispose by re-emitting Escape on
// `hidden.bs.modal` (the event it already listens for in capture phase).
function requestClose(props) {
  props.onClose?.();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

function cleanupBootstrapModalLeftovers() {
  if (typeof document === "undefined") return;
  // If a dialog is disposed while still shown (e.g. replaced by another dialog),
  // Bootstrap's dispose() doesn't remove the backdrop / scroll-lock. Clean up.
  document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

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
  onMount(() => {
    const Modal = typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal;
    if (!Modal || !modalEl) {
      // Fallback (bundle missing): show without Bootstrap JS so the dialog still appears.
      if (modalEl) {
        modalEl.classList.add("show");
        modalEl.style.display = "block";
      }
      return;
    }
    instance = new Modal(modalEl, { backdrop: true, keyboard: true, focus: true });
    modalEl.addEventListener("hidden.bs.modal", () => requestClose(props));
    instance.show();
  });
  onCleanup(() => {
    try {
      instance && instance.dispose();
    } catch {}
    cleanupBootstrapModalLeftovers();
  });
  return (() => {
    var _el$ = _tmplModal$(),
      _el$3 = _el$.firstChild,
      _el$4 = _el$3.firstChild;
    modalEl = _el$;
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return hasHeader();
      },
      get children() {
        var _h$ = _tmplHeader$(),
          _title$ = _h$.firstChild,
          _action$ = _title$.nextSibling;
        _$insert(_title$, _$createComponent(Show, {
          get when() {
            return props.title;
          },
          get children() {
            return props.title;
          }
        }));
        _$insert(_action$, _$createComponent(Switch, {
          get children() {
            return [_$createComponent(Match, {
              get when() {
                return props.action;
              },
              get children() {
                return props.action;
              }
            }), _$createComponent(Match, {
              when: true,
              get children() {
                return _$createComponent(IconButton, {
                  "data-slot": "dialog-close-button",
                  icon: "close",
                  variant: "ghost",
                  "aria-label": "Close",
                  onClick: close
                });
              }
            })];
          }
        }));
        return _h$;
      }
    }), null);
    // Always-present close button when there's no header (e.g. Settings has no
    // title → no header → previously no way to close). Floating top-right.
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return !hasHeader();
      },
      get children() {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn-close";
        b.setAttribute("aria-label", "Close");
        b.style.cssText = "position:absolute;top:12px;right:14px;z-index:10;";
        b.addEventListener("click", close);
        return b;
      }
    }), null);
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return props.description;
      },
      get children() {
        var _d$ = _tmplDesc$();
        _$insert(_d$, () => props.description);
        return _d$;
      }
    }), null);
    _$insert(_el$4, (() => {
      var _b$ = _tmplBody$();
      _$insert(_b$, () => props.children);
      return _b$;
    })(), null);
    _$effect(() => {
      _$setAttribute(_el$, "data-fit", props.fit ? "true" : undefined);
      _$setAttribute(_el$, "data-size", props.size || "normal");
      // NB: deliberately NOT setting data-transition — Bootstrap's `.modal.fade`
      // now provides the open/close animation. The closedcode dialog.css
      // [data-transition] rule runs `contentHide` (→ opacity:0) unless a
      // [data-expanded] flag is toggled, which would leave the content invisible.
      _$className(
        _el$3,
        ("modal-dialog modal-dialog-scrollable modal-dialog-centered " + dialogSizeClass(props.size)).trim(),
      );
      _$setAttribute(_el$4, "data-no-header", hasHeader() ? undefined : "");
      // Forward consumer `class` onto the content element.
      _$className(_el$4, ("modal-content " + (props.class ?? "")).trim());
    });
    return _el$;
  })();
}
