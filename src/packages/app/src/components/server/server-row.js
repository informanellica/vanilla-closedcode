import { template as _$template } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span class=text-white>v`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span class="d-flex align-items-center gap-2"><span>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div><div class="d-flex flex-column align-items-start min-w-0 w-100"><div class="d-flex flex-row align-items-center gap-2 min-w-0 w-100"><span>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span>v`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-flex flex-row gap-3"><span>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<span class=text-secondary>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span class=text-body-secondary>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span class=text-secondary>••••••••`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div>`);
import { Tooltip } from "@/bs/tooltip.js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { children, createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import { useLanguage } from "@/context/language.js";
import { serverName } from "@/context/server.js";
export function ServerRow(props) {
  const language = useLanguage();
  const [truncated, setTruncated] = createSignal(false);
  let nameRef;
  let versionRef;
  const name = createMemo(() => serverName(props.conn));
  const check = () => {
    const nameTruncated = nameRef ? nameRef.scrollWidth > nameRef.clientWidth : false;
    const versionTruncated = versionRef ? versionRef.scrollWidth > versionRef.clientWidth : false;
    setTruncated(nameTruncated || versionTruncated);
  };
  createEffect(() => {
    name();
    props.conn.http.url;
    props.status?.version;
    queueMicrotask(check);
  });
  onMount(() => {
    if (typeof ResizeObserver !== "function") return;
    createResizeObserver([nameRef, versionRef], check);
    check();
  });
  const tooltipValue = () => (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, () => serverName(props.conn, true));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return props.status?.version;
      },
      get children() {
        var _el$3 = _tmpl$(),
          _el$4 = _el$3.firstChild;
        _$insert(_el$3, () => props.status?.version, null);
        return _el$3;
      }
    }), null);
    return _el$;
  })();
  const badge = children(() => props.badge);
  return _$createComponent(Tooltip, {
    "class": "flex-1 min-w-0",
    get value() {
      return tooltipValue();
    },
    contentStyle: {
      "max-width": "none",
      "white-space": "nowrap"
    },
    placement: "top-start",
    get inactive() {
      return _$memo(() => !!!truncated())() && !props.conn.displayName;
    },
    get children() {
      var _el$5 = _tmpl$3(),
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.firstChild,
        _el$8 = _el$7.firstChild;
      var _ref$ = nameRef;
      typeof _ref$ === "function" ? _$use(_ref$, _el$8) : nameRef = _el$8;
      _$insert(_el$8, name);
      _$insert(_el$7, _$createComponent(Show, {
        get when() {
          return badge();
        },
        get fallback() {
          return _$createComponent(Show, {
            get when() {
              return props.status?.version;
            },
            get children() {
              var _el$9 = _tmpl$4(),
                _el$0 = _el$9.firstChild;
              var _ref$2 = versionRef;
              typeof _ref$2 === "function" ? _$use(_ref$2, _el$9) : versionRef = _el$9;
              _$insert(_el$9, () => props.status?.version, null);
              _$effect(() => _$className(_el$9, `${props.versionClass ?? "text-secondary fw-normal truncate"} min-w-0`));
              return _el$9;
            }
          });
        },
        children: badge => badge()
      }), null);
      _$insert(_el$6, _$createComponent(Show, {
        get when() {
          return _$memo(() => !!(props.showCredentials && props.conn.type === "http"))() && props.conn;
        },
        children: conn => (() => {
          var _el$1 = _tmpl$5(),
            _el$10 = _el$1.firstChild;
          _$insert(_el$10, (() => {
            var _c$ = _$memo(() => !!conn().http.username);
            return () => _c$() ? (() => {
              var _el$11 = _tmpl$6();
              _$insert(_el$11, () => conn().http.username);
              return _el$11;
            })() : (() => {
              var _el$12 = _tmpl$7();
              _$insert(_el$12, () => language.t("server.row.noUsername"));
              return _el$12;
            })();
          })());
          _$insert(_el$1, (() => {
            var _c$2 = _$memo(() => !!conn().http.password);
            return () => _c$2() && _tmpl$8();
          })(), null);
          return _el$1;
        })()
      }), null);
      _$insert(_el$5, () => props.children, null);
      _$effect(_p$ => {
        var _v$ = props.class,
          _v$2 = !!props.dimmed,
          _v$3 = `${props.nameClass ?? "truncate"} min-w-0`;
        _v$ !== _p$.e && _$className(_el$5, _p$.e = _v$);
        _v$2 !== _p$.t && _el$5.classList.toggle("opacity-50", _p$.t = _v$2);
        _v$3 !== _p$.a && _$className(_el$8, _p$.a = _v$3);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$5;
    }
  });
}
export function ServerHealthIndicator(props) {
  return (() => {
    var _el$14 = _tmpl$9();
    _$effect(_$p => _$classList(_el$14, {
      "size-1.5 rounded-circle shrink-0": true,
      "bg-success": props.health?.healthy === true,
      "bg-danger": props.health?.healthy === false,
      "bg-secondary": props.health === undefined
    }, _$p));
    return _el$14;
  })();
}