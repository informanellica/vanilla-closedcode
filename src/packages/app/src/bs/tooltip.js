import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { Match, Show, Switch, createUniqueId, splitProps } from "solid-js";
import { createStore } from "solid-js/store";

var _tmplWrap$ = /*#__PURE__*/_$template(`<div data-component=tooltip-trigger style="position:relative;display:contents">`);
var _tmplPop$ = /*#__PURE__*/_$template(`<div data-component=tooltip role=tooltip>`);
var _tmplKeybind$ = /*#__PURE__*/_$template(`<span data-slot=tooltip-keybind><span></span><span data-slot=tooltip-keybind-key class="badge text-bg-secondary rounded ms-2">`);

const placementStyle = placement => {
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
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "contentClass",
    "contentStyle",
    "inactive",
    "forceOpen",
    "ignoreSafeArea",
    "placement",
    "gutter",
    "value",
  ]);
  const [state, setState] = createStore({ open: false });
  const id = createUniqueId();
  const isOpen = () => !!local.forceOpen || state.open;
  const open = () => setState("open", true);
  const close = () => setState("open", false);
  return _$createComponent(Switch, {
    get children() {
      return [
        _$createComponent(Match, {
          get when() {
            return local.inactive;
          },
          get children() {
            return local.children;
          },
        }),
        _$createComponent(Match, {
          when: true,
          get children() {
            var _el$ = _tmplWrap$();
            _$spread(
              _el$,
              _$mergeProps(others, {
                get classList() {
                  return { [local.class ?? ""]: !!local.class };
                },
                get ["aria-describedby"]() {
                  return isOpen() ? id : undefined;
                },
              }),
              false,
              true,
            );
            _el$.addEventListener("pointerenter", open);
            _el$.addEventListener("pointerleave", close);
            _el$.addEventListener("focusin", open);
            _el$.addEventListener("focusout", close);
            _$insert(_el$, () => local.children, null);
            _$insert(
              _el$,
              _$createComponent(Show, {
                get when() {
                  return isOpen();
                },
                get children() {
                  var _pop$ = _tmplPop$();
                  _$setAttribute(_pop$, "id", id);
                  _$spread(
                    _pop$,
                    _$mergeProps({
                      "data-component": "tooltip",
                      get ["data-placement"]() {
                        return local.placement ?? "top";
                      },
                      get ["data-force-open"]() {
                        return local.forceOpen;
                      },
                      get classList() {
                        return {
                          "popover bs-popover-auto shadow-sm border rounded px-2 py-1 small": true,
                          "bg-dark text-light": true,
                          [local.contentClass ?? ""]: !!local.contentClass,
                        };
                      },
                    }),
                    false,
                    true,
                  );
                  _$effect(() =>
                    _$setAttribute(
                      _pop$,
                      "style",
                      placementStyle(local.placement) +
                        "z-index:1080;width:max-content;max-width:320px;pointer-events:none;" +
                        (local.contentStyle ?? ""),
                    ),
                  );
                  _$insert(_pop$, () => local.value);
                  return _pop$;
                },
              }),
              null,
            );
            return _el$;
          },
        }),
      ];
    },
  });
}

export function TooltipKeybind(props) {
  const [local, others] = splitProps(props, ["title", "keybind"]);
  return _$createComponent(
    Tooltip,
    _$mergeProps(others, {
      get value() {
        var _el$ = _tmplKeybind$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.nextSibling;
        _$insert(_el$2, () => local.title);
        _$insert(_el$3, () => local.keybind);
        return _el$;
      },
    }),
  );
}
