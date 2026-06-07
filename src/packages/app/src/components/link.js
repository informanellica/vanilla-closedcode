import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<a>`);
import { splitProps } from "solid-js";
import { usePlatform } from "@/context/platform.js";
export function Link(props) {
  const platform = usePlatform();
  const [local, rest] = splitProps(props, ["href", "children", "class"]);
  return (() => {
    var _el$ = _tmpl$();
    _el$.$$click = event => {
      if (!local.href) return;
      event.preventDefault();
      platform.openLink(local.href);
    };
    _$spread(_el$, _$mergeProps({
      get href() {
        return local.href;
      },
      get ["class"]() {
        return `text-body-emphasis underline ${local.class ?? ""}`;
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}
_$delegateEvents(["click"]);