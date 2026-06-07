import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex min-h-56 flex-column align-items-center justify-content-center gap-2 px-6 py-10 text-center"><div class="fw-semibold text-body-emphasis"></div><div class="fw-normal text-secondary">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex min-h-40 align-items-center justify-content-center px-6 py-4 text-center text-secondary">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex justify-content-center bg-body px-6 py-4"><img class="max-h-[60vh] max-w-full rounded-2 border border-body object-contain">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex justify-content-center bg-body px-6 py-4"><audio class="w-100 max-w-xl"controls preload=metadata><source>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-4 px-6 py-4">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="d-flex justify-content-center"><img class="max-h-[60vh] max-w-full rounded-2 border border-body object-contain">`);
import { createEffect, createMemo, createResource, Match, on, Show, Switch } from "solid-js";
import { useI18n } from "../context/i18n.js";
import { dataUrlFromMediaValue, hasMediaValue, isBinaryContent, mediaKindFromPath, normalizeMimeType, svgTextFromValue } from "../pierre/media.js";
function mediaValue(cfg, mode) {
  if (cfg.current !== undefined) return cfg.current;
  if (mode === "image") return cfg.after ?? cfg.before;
  return cfg.after ?? cfg.before;
}
export function FileMedia(props) {
  const i18n = useI18n();
  const cfg = () => props.media;
  const kind = createMemo(() => {
    const media = cfg();
    if (!media || media.mode === "off") return;
    return mediaKindFromPath(media.path);
  });
  const isBinary = createMemo(() => {
    const media = cfg();
    if (!media || media.mode === "off") return false;
    if (kind()) return false;
    return isBinaryContent(media.current);
  });
  const onLoad = () => props.media?.onLoad?.();
  const deleted = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || !k) return false;
    if (media.deleted) return true;
    if (k === "svg") return false;
    if (media.current !== undefined) return false;
    return !hasMediaValue(media.after) && hasMediaValue(media.before);
  });
  const direct = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || k !== "image" && k !== "audio") return;
    return dataUrlFromMediaValue(mediaValue(media, k), k);
  });
  const request = createMemo(() => {
    const media = cfg();
    const k = kind();
    if (!media || k !== "image" && k !== "audio") return;
    if (media.current !== undefined) return;
    if (deleted()) return;
    if (direct()) return;
    if (!media.path || !media.readFile) return;
    return {
      key: `${k}:${media.path}`,
      kind: k,
      path: media.path,
      readFile: media.readFile,
      onError: media.onError
    };
  });
  const [loaded] = createResource(request, async input => {
    return input.readFile(input.path).then(result => {
      const src = dataUrlFromMediaValue(result, input.kind);
      if (!src) {
        input.onError?.({
          kind: input.kind
        });
        return {
          key: input.key,
          error: true
        };
      }
      return {
        key: input.key,
        src,
        mime: input.kind === "audio" ? normalizeMimeType(result?.mimeType) : undefined
      };
    }, () => {
      input.onError?.({
        kind: input.kind
      });
      return {
        key: input.key,
        error: true
      };
    });
  });
  const remote = createMemo(() => {
    const input = request();
    const value = loaded();
    if (!input || !value || value.key !== input.key) return;
    return value;
  });
  const src = createMemo(() => {
    const value = remote();
    return direct() ?? (value && "src" in value ? value.src : undefined);
  });
  const status = createMemo(() => {
    if (direct()) return "ready";
    if (!request()) return "idle";
    if (loaded.loading) return "loading";
    if (remote()?.error) return "error";
    if (src()) return "ready";
    return "idle";
  });
  const audioMime = createMemo(() => {
    const value = remote();
    return value && "mime" in value ? value.mime : undefined;
  });
  const svgSource = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    return svgTextFromValue(media.current);
  });
  const svgSrc = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    return dataUrlFromMediaValue(media.current, "svg");
  });
  const svgInvalid = createMemo(() => {
    const media = cfg();
    if (!media || kind() !== "svg") return;
    if (svgSource() !== undefined) return;
    if (!hasMediaValue(media.current)) return;
    return [media.path, media.current];
  });
  createEffect(on(svgInvalid, value => {
    if (!value) return;
    cfg()?.onError?.({
      kind: "svg"
    });
  }, {
    defer: true
  }));
  const kindLabel = value => i18n.t(value === "image" ? "ui.fileMedia.kind.image" : "ui.fileMedia.kind.audio");
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return kind() === "image" || kind() === "audio";
        },
        get children() {
          return _$createComponent(Show, {
            get when() {
              return src();
            },
            get fallback() {
              const media = cfg();
              const k = kind();
              if (!media || k !== "image" && k !== "audio") return props.fallback();
              const label = kindLabel(k);
              if (deleted()) {
                return (() => {
                  var _el$4 = _tmpl$2();
                  _$insert(_el$4, () => i18n.t("ui.fileMedia.state.removed", {
                    kind: label
                  }));
                  return _el$4;
                })();
              }
              if (status() === "loading") {
                return (() => {
                  var _el$5 = _tmpl$2();
                  _$insert(_el$5, () => i18n.t("ui.fileMedia.state.loading", {
                    kind: label
                  }));
                  return _el$5;
                })();
              }
              if (status() === "error") {
                return (() => {
                  var _el$6 = _tmpl$2();
                  _$insert(_el$6, () => i18n.t("ui.fileMedia.state.error", {
                    kind: label
                  }));
                  return _el$6;
                })();
              }
              return (() => {
                var _el$7 = _tmpl$2();
                _$insert(_el$7, () => i18n.t("ui.fileMedia.state.unavailable", {
                  kind: label
                }));
                return _el$7;
              })();
            },
            children: value => {
              const k = kind();
              if (k !== "image" && k !== "audio") return props.fallback();
              if (k === "image") {
                return (() => {
                  var _el$8 = _tmpl$3(),
                    _el$9 = _el$8.firstChild;
                  _el$9.addEventListener("load", onLoad);
                  _$effect(_p$ => {
                    var _v$ = value(),
                      _v$2 = cfg()?.path;
                    _v$ !== _p$.e && _$setAttribute(_el$9, "src", _p$.e = _v$);
                    _v$2 !== _p$.t && _$setAttribute(_el$9, "alt", _p$.t = _v$2);
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$8;
                })();
              }
              return (() => {
                var _el$0 = _tmpl$4(),
                  _el$1 = _el$0.firstChild,
                  _el$10 = _el$1.firstChild;
                _el$1.addEventListener("loadedmetadata", onLoad);
                _$effect(_p$ => {
                  var _v$3 = value(),
                    _v$4 = audioMime();
                  _v$3 !== _p$.e && _$setAttribute(_el$10, "src", _p$.e = _v$3);
                  _v$4 !== _p$.t && _$setAttribute(_el$10, "type", _p$.t = _v$4);
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$0;
              })();
            }
          });
        }
      }), _$createComponent(Match, {
        get when() {
          return kind() === "svg";
        },
        get children() {
          return (() => {
            if (svgSource() === undefined && svgSrc() == null) return props.fallback();
            return (() => {
              var _el$11 = _tmpl$5();
              _$insert(_el$11, _$createComponent(Show, {
                get when() {
                  return svgSource() !== undefined;
                },
                get children() {
                  return props.fallback();
                }
              }), null);
              _$insert(_el$11, _$createComponent(Show, {
                get when() {
                  return svgSrc();
                },
                children: value => (() => {
                  var _el$12 = _tmpl$6(),
                    _el$13 = _el$12.firstChild;
                  _el$13.addEventListener("load", onLoad);
                  _$effect(_p$ => {
                    var _v$5 = value(),
                      _v$6 = cfg()?.path;
                    _v$5 !== _p$.e && _$setAttribute(_el$13, "src", _p$.e = _v$5);
                    _v$6 !== _p$.t && _$setAttribute(_el$13, "alt", _p$.t = _v$6);
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$12;
                })()
              }), null);
              return _el$11;
            })();
          })();
        }
      }), _$createComponent(Match, {
        get when() {
          return isBinary();
        },
        get children() {
          var _el$ = _tmpl$(),
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.nextSibling;
          _$insert(_el$2, () => cfg()?.path?.split("/").pop() ?? i18n.t("ui.fileMedia.binary.title"));
          _$insert(_el$3, () => {
            const path = cfg()?.path;
            if (!path) return i18n.t("ui.fileMedia.binary.description.default");
            return i18n.t("ui.fileMedia.binary.description.path", {
              path
            });
          });
          return _el$;
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return props.fallback();
        }
      })];
    }
  });
}