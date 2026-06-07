import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class=scroll-view__thumb style=z-index:100>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div><div class=scroll-view__viewport tabindex=0 role=region>`);
import { onMount, splitProps, Show, mergeProps } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createStore } from "solid-js/store";
import { useI18n } from "../context/i18n.js";
export const scrollKey = event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  switch (event.key) {
    case "PageDown":
      return "page-down";
    case "PageUp":
      return "page-up";
    case "Home":
      return "home";
    case "End":
      return "end";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
  }
};
export function ScrollView(props) {
  const i18n = useI18n();
  const merged = mergeProps({
    orientation: "vertical"
  }, props);
  const [local, events, rest] = splitProps(merged, ["class", "children", "viewportRef", "orientation", "style"], ["onScroll", "onWheel", "onTouchStart", "onTouchMove", "onTouchEnd", "onTouchCancel", "onPointerDown", "onClick", "onKeyDown"]);
  let rootRef;
  let viewportRef;
  let thumbRef;
  const [state, setState] = createStore({
    isHovered: false,
    isDragging: false,
    thumbHeight: 0,
    thumbTop: 0,
    showThumb: false
  });
  const isHovered = () => state.isHovered;
  const isDragging = () => state.isDragging;
  const thumbHeight = () => state.thumbHeight;
  const thumbTop = () => state.thumbTop;
  const showThumb = () => state.showThumb;
  const updateThumb = () => {
    if (!viewportRef) return;
    const {
      scrollTop,
      scrollHeight,
      clientHeight
    } = viewportRef;
    if (scrollHeight <= clientHeight || scrollHeight === 0) {
      setState("showThumb", false);
      return;
    }
    setState("showThumb", true);
    const trackPadding = 8;
    const trackHeight = clientHeight - trackPadding * 2;
    const minThumbHeight = 32;
    // Calculate raw thumb height based on ratio
    let height = clientHeight / scrollHeight * trackHeight;
    height = Math.max(height, minThumbHeight);
    const maxScrollTop = scrollHeight - clientHeight;
    const maxThumbTop = trackHeight - height;
    const top = maxScrollTop > 0 ? scrollTop / maxScrollTop * maxThumbTop : 0;

    // Ensure thumb stays within bounds (shouldn't be necessary due to math above, but good for safety)
    const boundedTop = trackPadding + Math.max(0, Math.min(top, maxThumbTop));
    setState("thumbHeight", height);
    setState("thumbTop", boundedTop);
  };
  onMount(() => {
    if (local.viewportRef) {
      local.viewportRef(viewportRef);
    }
    createResizeObserver([viewportRef, viewportRef.firstElementChild], updateThumb);
    updateThumb();
  });
  let startY = 0;
  let startScrollTop = 0;
  const onThumbPointerDown = e => {
    e.preventDefault();
    e.stopPropagation();
    setState("isDragging", true);
    startY = e.clientY;
    startScrollTop = viewportRef.scrollTop;
    thumbRef.setPointerCapture(e.pointerId);
    const onPointerMove = e => {
      const deltaY = e.clientY - startY;
      const {
        scrollHeight,
        clientHeight
      } = viewportRef;
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = clientHeight - thumbHeight();
      if (maxThumbTop > 0) {
        const scrollDelta = deltaY * (maxScrollTop / maxThumbTop);
        viewportRef.scrollTop = startScrollTop + scrollDelta;
      }
    };
    const onPointerUp = e => {
      setState("isDragging", false);
      thumbRef.releasePointerCapture(e.pointerId);
      thumbRef.removeEventListener("pointermove", onPointerMove);
      thumbRef.removeEventListener("pointerup", onPointerUp);
    };
    thumbRef.addEventListener("pointermove", onPointerMove);
    thumbRef.addEventListener("pointerup", onPointerUp);
  };

  // Keybinds implementation
  // We ensure the viewport has a tabindex so it can receive focus
  // We can also explicitly catch PageUp/Down if we want smooth scroll or specific behavior,
  // but native usually handles this perfectly. Let's explicitly ensure it behaves well.
  const onKeyDown = e => {
    // If user is focused on an input inside the scroll view, don't hijack keys
    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      return;
    }
    const next = scrollKey(e);
    if (!next) return;
    const scrollAmount = viewportRef.clientHeight * 0.8;
    const lineAmount = 40;
    switch (next) {
      case "page-down":
        e.preventDefault();
        viewportRef.scrollBy({
          top: scrollAmount,
          behavior: "smooth"
        });
        break;
      case "page-up":
        e.preventDefault();
        viewportRef.scrollBy({
          top: -scrollAmount,
          behavior: "smooth"
        });
        break;
      case "home":
        e.preventDefault();
        viewportRef.scrollTo({
          top: 0,
          behavior: "smooth"
        });
        break;
      case "end":
        e.preventDefault();
        viewportRef.scrollTo({
          top: viewportRef.scrollHeight,
          behavior: "smooth"
        });
        break;
      case "up":
        e.preventDefault();
        viewportRef.scrollBy({
          top: -lineAmount,
          behavior: "smooth"
        });
        break;
      case "down":
        e.preventDefault();
        viewportRef.scrollBy({
          top: lineAmount,
          behavior: "smooth"
        });
        break;
    }
  };
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild;
    _el$.addEventListener("pointerleave", () => setState("isHovered", false));
    _el$.addEventListener("pointerenter", () => setState("isHovered", true));
    var _ref$ = rootRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : rootRef = _el$;
    _$spread(_el$, _$mergeProps({
      get ["class"]() {
        return `scroll-view ${local.class || ""}`;
      },
      get style() {
        return local.style;
      }
    }, rest), false, true);
    _el$2.$$keydown = e => {
      onKeyDown(e);
      if (typeof events.onKeyDown === "function") events.onKeyDown(e);
    };
    _$addEventListener(_el$2, "click", events.onClick, true);
    _$addEventListener(_el$2, "pointerdown", events.onPointerDown, true);
    _$addEventListener(_el$2, "touchcancel", events.onTouchCancel);
    _$addEventListener(_el$2, "touchend", events.onTouchEnd, true);
    _$addEventListener(_el$2, "touchmove", events.onTouchMove, true);
    _$addEventListener(_el$2, "touchstart", events.onTouchStart, true);
    _$addEventListener(_el$2, "wheel", events.onWheel);
    _el$2.addEventListener("scroll", e => {
      updateThumb();
      if (typeof events.onScroll === "function") events.onScroll(e);
    });
    var _ref$2 = viewportRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$2) : viewportRef = _el$2;
    _$insert(_el$2, () => local.children);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return showThumb();
      },
      get children() {
        var _el$3 = _tmpl$();
        _el$3.$$pointerdown = onThumbPointerDown;
        var _ref$3 = thumbRef;
        typeof _ref$3 === "function" ? _$use(_ref$3, _el$3) : thumbRef = _el$3;
        _$effect(_p$ => {
          var _v$ = isHovered() || isDragging(),
            _v$2 = isDragging(),
            _v$3 = `${thumbHeight()}px`,
            _v$4 = `translateY(${thumbTop()}px)`;
          _v$ !== _p$.e && _$setAttribute(_el$3, "data-visible", _p$.e = _v$);
          _v$2 !== _p$.t && _$setAttribute(_el$3, "data-dragging", _p$.t = _v$2);
          _v$3 !== _p$.a && _$setStyleProperty(_el$3, "height", _p$.a = _v$3);
          _v$4 !== _p$.o && _$setStyleProperty(_el$3, "transform", _p$.o = _v$4);
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined
        });
        return _el$3;
      }
    }), null);
    _$effect(() => _$setAttribute(_el$2, "aria-label", i18n.t("ui.scrollView.ariaLabel")));
    return _el$;
  })();
}
_$delegateEvents(["touchstart", "touchmove", "touchend", "pointerdown", "click", "keydown"]);