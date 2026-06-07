import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<html><head><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><title>ClosedCode</title><meta name=theme-color content=#F8F7F7><meta name=theme-color content=#131010 media="(prefers-color-scheme: dark)"></head><body class="antialiased overscroll-none text-12-regular"><div id=app>`);
// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";
export default createHandler(() => _$createComponent(StartServer, {
  document: ({
    assets,
    children,
    scripts
  }) => {
    const lang = (() => {
      const event = getRequestEvent();
      const header = event?.request.headers.get("accept-language");
      if (!header) return "en";
      for (const item of header.split(",")) {
        const value = item.trim().split(";")[0]?.toLowerCase();
        if (!value) continue;
        if (value.startsWith("zh")) return "zh";
        if (value.startsWith("en")) return "en";
      }
      return "en";
    })();
    return (() => {
      var _el$ = _tmpl$(),
        _el$8 = _el$.firstChild,
        _el$9 = _el$8.firstChild;
      _$setAttribute(_el$, "lang", lang);
      _$insert(_el$9, children);
      _$insert(_el$8, scripts, null);
      return _el$;
    })();
  }
}));