import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="absolute inset-x-0 -top-2 -translate-y-full origin-bottom-left max-h-80 min-h-10 overflow-auto no-scrollbar d-flex flex-column p-2 rounded-[12px] bg-body-tertiary shadow-[var(--shadow-lg-border-base)]">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="text-secondary px-2 py-1">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<button class="w-100 d-flex align-items-center gap-x-2 rounded-2 px-2 py-0.5"><span class="fw-normal text-body-emphasis whitespace-nowrap">@`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span class="text-body-emphasis whitespace-nowrap">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<button class="w-100 d-flex align-items-center gap-x-2 rounded-2 px-2 py-0.5"><div class="d-flex align-items-center fw-normal min-w-0"><span class="text-secondary whitespace-nowrap truncate min-w-0">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<span class="fw-normal text-secondary truncate">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span class="small fw-normal text-body-secondary px-1.5 py-0.5 bg-body-tertiary rounded-2">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span class="small fw-normal text-body-secondary">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<button><div class="d-flex align-items-center gap-2 min-w-0"><span class="fw-normal text-body-emphasis whitespace-nowrap">/</span></div><div class="d-flex align-items-center gap-2 shrink-0">`);
import { For, Match, Show, Switch } from "solid-js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { Icon } from "@/bs/icon.js";
import { getDirectory, getFilename } from "core/util/path";
export const PromptPopover = props => {
  return _$createComponent(Show, {
    get when() {
      return props.popover;
    },
    get children() {
      var _el$ = _tmpl$();
      _el$.$$mousedown = e => e.preventDefault();
      _$use(el => {
        if (props.popover === "slash") props.setSlashPopoverRef(el);
      }, _el$);
      _$insert(_el$, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return props.popover === "at";
            },
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return props.atFlat.length > 0;
                },
                get fallback() {
                  return (() => {
                    var _el$2 = _tmpl$2();
                    _$insert(_el$2, () => props.t("prompt.popover.emptyResults"));
                    return _el$2;
                  })();
                },
                get children() {
                  return _$createComponent(For, {
                    get each() {
                      return props.atFlat.slice(0, 10);
                    },
                    children: item => {
                      const key = props.atKey(item);
                      if (item.type === "agent") {
                        return (() => {
                          var _el$3 = _tmpl$3(),
                            _el$4 = _el$3.firstChild,
                            _el$5 = _el$4.firstChild;
                          _el$3.addEventListener("mouseenter", () => props.setAtActive(key));
                          _el$3.$$click = () => props.onAtSelect(item);
                          _$insert(_el$3, _$createComponent(Icon, {
                            name: "brain",
                            size: "small",
                            "class": "text-secondary shrink-0"
                          }), _el$4);
                          _$insert(_el$4, () => item.name, null);
                          _$effect(() => _el$3.classList.toggle("bg-primary-subtle", !!(props.atActive === key)));
                          return _el$3;
                        })();
                      }
                      const isDirectory = item.path.endsWith("/");
                      const directory = isDirectory ? item.path : getDirectory(item.path);
                      const filename = isDirectory ? "" : getFilename(item.path);
                      return (() => {
                        var _el$6 = _tmpl$5(),
                          _el$7 = _el$6.firstChild,
                          _el$8 = _el$7.firstChild;
                        _el$6.addEventListener("mouseenter", () => props.setAtActive(key));
                        _el$6.$$click = () => props.onAtSelect(item);
                        _$insert(_el$6, _$createComponent(FileIcon, {
                          get node() {
                            return {
                              path: item.path,
                              type: "file"
                            };
                          },
                          "class": "shrink-0 size-4"
                        }), _el$7);
                        _$insert(_el$8, directory);
                        _$insert(_el$7, _$createComponent(Show, {
                          when: !isDirectory,
                          get children() {
                            var _el$9 = _tmpl$4();
                            _$insert(_el$9, filename);
                            return _el$9;
                          }
                        }), null);
                        _$effect(() => _el$6.classList.toggle("bg-primary-subtle", !!(props.atActive === key)));
                        return _el$6;
                      })();
                    }
                  });
                }
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return props.popover === "slash";
            },
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return props.slashFlat.length > 0;
                },
                get fallback() {
                  return (() => {
                    var _el$0 = _tmpl$2();
                    _$insert(_el$0, () => props.t("prompt.popover.emptyCommands"));
                    return _el$0;
                  })();
                },
                get children() {
                  return _$createComponent(For, {
                    get each() {
                      return props.slashFlat;
                    },
                    children: cmd => (() => {
                      var _el$1 = _tmpl$9(),
                        _el$10 = _el$1.firstChild,
                        _el$11 = _el$10.firstChild,
                        _el$12 = _el$11.firstChild,
                        _el$14 = _el$10.nextSibling;
                      _el$1.addEventListener("mouseenter", () => props.setSlashActive(cmd.id));
                      _el$1.$$click = () => props.onSlashSelect(cmd);
                      _$insert(_el$11, () => cmd.trigger, null);
                      _$insert(_el$10, _$createComponent(Show, {
                        get when() {
                          return cmd.description;
                        },
                        get children() {
                          var _el$13 = _tmpl$6();
                          _$insert(_el$13, () => cmd.description);
                          return _el$13;
                        }
                      }), null);
                      _$insert(_el$14, _$createComponent(Show, {
                        get when() {
                          return _$memo(() => cmd.type === "custom")() && cmd.source !== "command";
                        },
                        get children() {
                          var _el$15 = _tmpl$7();
                          _$insert(_el$15, (() => {
                            var _c$ = _$memo(() => cmd.source === "skill");
                            return () => _c$() ? props.t("prompt.slash.badge.skill") : _$memo(() => cmd.source === "mcp")() ? props.t("prompt.slash.badge.mcp") : props.t("prompt.slash.badge.custom");
                          })());
                          return _el$15;
                        }
                      }), null);
                      _$insert(_el$14, _$createComponent(Show, {
                        get when() {
                          return props.commandKeybind(cmd.id);
                        },
                        get children() {
                          var _el$16 = _tmpl$8();
                          _$insert(_el$16, () => props.commandKeybind(cmd.id));
                          return _el$16;
                        }
                      }), null);
                      _$effect(_p$ => {
                        var _v$ = cmd.id,
                          _v$2 = {
                            "w-100 d-flex align-items-center justify-content-between gap-4 rounded-2 px-2 py-1": true,
                            "bg-primary-subtle": props.slashActive === cmd.id
                          };
                        _v$ !== _p$.e && _$setAttribute(_el$1, "data-slash-id", _p$.e = _v$);
                        _p$.t = _$classList(_el$1, _v$2, _p$.t);
                        return _p$;
                      }, {
                        e: undefined,
                        t: undefined
                      });
                      return _el$1;
                    })()
                  });
                }
              });
            }
          })];
        }
      }));
      return _el$;
    }
  });
};
_$delegateEvents(["mousedown", "click"]);