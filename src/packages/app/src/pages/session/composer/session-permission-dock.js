import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=permission-row><span data-slot=permission-spacer aria-hidden=true></span><div data-slot=permission-hint>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=permission-row><span data-slot=permission-spacer aria-hidden=true></span><div data-slot=permission-patterns>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=permission-row data-variant=header><span data-slot=permission-icon></span><div data-slot=permission-header-title>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=permission-footer-actions>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<code class="small fw-normal text-body break-all">`);
import { For, Show } from "solid-js";
import { Button } from "@/bs/button.js";
import { DockPrompt } from "@/vendor/ui/components/dock-prompt.js";
import { Icon } from "@/bs/icon.js";
import { useLanguage } from "@/context/language.js";
export function SessionPermissionDock(props) {
  const language = useLanguage();
  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`;
    const value = language.t(key);
    if (value === key) return "";
    return value;
  };
  return _$createComponent(DockPrompt, {
    kind: "permission",
    get header() {
      return (() => {
        var _el$7 = _tmpl$3(),
          _el$8 = _el$7.firstChild,
          _el$9 = _el$8.nextSibling;
        _$insert(_el$8, _$createComponent(Icon, {
          name: "warning",
          size: "normal"
        }));
        _$insert(_el$9, () => language.t("notification.permission.title"));
        return _el$7;
      })();
    },
    get footer() {
      return [_tmpl$4(), (() => {
        var _el$1 = _tmpl$5();
        _$insert(_el$1, _$createComponent(Button, {
          variant: "ghost",
          size: "normal",
          onClick: () => props.onDecide("reject"),
          get disabled() {
            return props.responding;
          },
          get children() {
            return language.t("ui.permission.deny");
          }
        }), null);
        _$insert(_el$1, _$createComponent(Button, {
          variant: "secondary",
          size: "normal",
          onClick: () => props.onDecide("always"),
          get disabled() {
            return props.responding;
          },
          get children() {
            return language.t("ui.permission.allowAlways");
          }
        }), null);
        _$insert(_el$1, _$createComponent(Button, {
          variant: "primary",
          size: "normal",
          onClick: () => props.onDecide("once"),
          get disabled() {
            return props.responding;
          },
          get children() {
            return language.t("ui.permission.allowOnce");
          }
        }), null);
        return _el$1;
      })()];
    },
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return toolDescription();
        },
        get children() {
          var _el$ = _tmpl$(),
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.nextSibling;
          _$insert(_el$3, toolDescription);
          return _el$;
        }
      }), _$createComponent(Show, {
        get when() {
          return props.request.patterns.length > 0;
        },
        get children() {
          var _el$4 = _tmpl$2(),
            _el$5 = _el$4.firstChild,
            _el$6 = _el$5.nextSibling;
          _$insert(_el$6, _$createComponent(For, {
            get each() {
              return props.request.patterns;
            },
            children: pattern => (() => {
              var _el$10 = _tmpl$6();
              _$insert(_el$10, pattern);
              return _el$10;
            })()
          }));
          return _el$4;
        }
      })];
    }
  });
}