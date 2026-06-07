import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<main class="text-center mx-auto text-gray-700 p-4"><h1 class="max-6-xs text-6xl text-sky-700 font-thin uppercase my-16">Not Found</h1><p class=mt-8>Visit <a href=https://solidjs.com target=_blank class="text-sky-600 hover:underline">solidjs.com</a> to learn how to build Solid apps.</p><p class=my-4> - `);
import { A } from "@solidjs/router";
export default function NotFound() {
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.nextSibling,
      _el$5 = _el$4.firstChild;
    _$insert(_el$4, _$createComponent(A, {
      href: "/",
      "class": "text-sky-600 hover:underline",
      children: "Home"
    }), _el$5);
    _$insert(_el$4, _$createComponent(A, {
      href: "/about",
      "class": "text-sky-600 hover:underline",
      children: "About Page"
    }), null);
    return _el$;
  })();
}