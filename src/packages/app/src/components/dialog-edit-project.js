import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2"><label class="small fw-medium text-secondary"></label><div class="d-flex gap-1.5">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<form class="d-flex flex-column gap-6 p-6 pt-0"><div class="d-flex flex-column gap-4"><div class="d-flex flex-column gap-2"><label class="small fw-medium text-secondary"></label><div class="d-flex gap-3 align-items-start"><div class=relative><div class="relative size-16 rounded-2 transition-colors cursor-pointer"></div><div class="absolute inset-0 size-16 bg-body-tertiary rounded-[6px] z-10 pointer-events-none d-flex align-items-center justify-content-center transition-opacity"></div><div class="absolute inset-0 size-16 bg-body-tertiary rounded-[6px] z-10 pointer-events-none d-flex align-items-center justify-content-center transition-opacity"></div></div><input id=icon-upload type=file accept=image/* class=d-none><div class="d-flex flex-column gap-1.5 small fw-normal text-secondary self-center"><span></span><span></span></div></div></div></div><div class="d-flex justify-content-end gap-2">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="size-full d-flex align-items-center justify-content-center">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<img class="size-full object-cover">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<button type=button>`);
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { TextField } from "@/bs/text-field.js";
import { useMutation } from "@tanstack/solid-query";
import { Icon } from "@/bs/icon.js";
import { createMemo, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { getAvatarColors } from "@/context/layout.js";
import { getFilename } from "core/util/path";
import { Avatar } from "@/vendor/ui/components/avatar.js";
import { useLanguage } from "@/context/language.js";
import { getProjectAvatarSource } from "@/pages/layout/sidebar-items.js";
import { useProjectController, AVATAR_COLOR_KEYS } from "@/controllers/project.js";
export function DialogEditProject(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const controller = useProjectController({
    get project() {
      return props.project;
    },
    onSaved: () => dialog.close()
  });
  const folderName = createMemo(() => getFilename(props.project.worktree));
  const defaultName = createMemo(() => props.project.name || folderName());
  const [store, setStore] = createStore({
    name: defaultName(),
    color: props.project.icon?.color,
    iconOverride: props.project.icon?.override,
    startup: props.project.commands?.start ?? "",
    dragOver: false,
    iconHover: false
  });
  let iconInput;
  function handleFileSelect(file) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      setStore("iconOverride", e.target?.result);
      setStore("iconHover", false);
    };
    reader.readAsDataURL(file);
  }
  function handleDrop(e) {
    e.preventDefault();
    setStore("dragOver", false);
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelect(file);
  }
  function handleDragOver(e) {
    e.preventDefault();
    setStore("dragOver", true);
  }
  function handleDragLeave() {
    setStore("dragOver", false);
  }
  function handleInputChange(e) {
    const input = e.target;
    const file = input.files?.[0];
    if (file) handleFileSelect(file);
  }
  function clearIcon() {
    setStore("iconOverride", "");
  }
  const saveMutation = useMutation(() => ({
    mutationFn: async () => {
      const name = store.name.trim() === folderName() ? "" : store.name.trim();
      const start = store.startup.trim();
      await controller.saveProject({
        name,
        startup: start,
        color: store.color,
        iconOverride: store.iconOverride
      });
    }
  }));
  function handleSubmit(e) {
    e.preventDefault();
    if (saveMutation.isPending) return;
    saveMutation.mutate();
  }
  return _$createComponent(Dialog, {
    get title() {
      return language.t("dialog.project.edit.title");
    },
    "class": "w-full max-w-[480px] mx-auto",
    get children() {
      var _el$ = _tmpl$2(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling,
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.firstChild,
        _el$8 = _el$7.nextSibling,
        _el$9 = _el$8.nextSibling,
        _el$0 = _el$6.nextSibling,
        _el$1 = _el$0.nextSibling,
        _el$10 = _el$1.firstChild,
        _el$11 = _el$10.nextSibling,
        _el$15 = _el$2.nextSibling;
      _el$.addEventListener("submit", handleSubmit);
      _$insert(_el$2, _$createComponent(TextField, {
        autofocus: true,
        type: "text",
        get label() {
          return language.t("dialog.project.edit.name");
        },
        get placeholder() {
          return folderName();
        },
        get value() {
          return store.name;
        },
        onChange: v => setStore("name", v)
      }), _el$3);
      _$insert(_el$4, () => language.t("dialog.project.edit.icon"));
      _el$6.addEventListener("mouseleave", () => setStore("iconHover", false));
      _el$6.addEventListener("mouseenter", () => setStore("iconHover", true));
      _el$7.$$click = () => {
        if (store.iconOverride && store.iconHover) {
          clearIcon();
        } else {
          iconInput?.click();
        }
      };
      _el$7.addEventListener("dragleave", handleDragLeave);
      _el$7.addEventListener("dragover", handleDragOver);
      _el$7.addEventListener("drop", handleDrop);
      _$insert(_el$7, _$createComponent(Show, {
        get when() {
          return getProjectAvatarSource(props.project.id, {
            color: store.color,
            url: props.project.icon?.url,
            override: store.iconOverride
          });
        },
        get fallback() {
          return (() => {
            var _el$16 = _tmpl$3();
            _$insert(_el$16, _$createComponent(Avatar, _$mergeProps({
              get fallback() {
                return store.name || defaultName();
              }
            }, () => getAvatarColors(store.color), {
              "class": "size-full text-[32px]"
            })));
            return _el$16;
          })();
        },
        children: src => (() => {
          var _el$17 = _tmpl$4();
          _$effect(_p$ => {
            var _v$6 = src(),
              _v$7 = language.t("dialog.project.edit.icon.alt");
            _v$6 !== _p$.e && _$setAttribute(_el$17, "src", _p$.e = _v$6);
            _v$7 !== _p$.t && _$setAttribute(_el$17, "alt", _p$.t = _v$7);
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$17;
        })()
      }));
      _$insert(_el$8, _$createComponent(Icon, {
        name: "cloud-upload",
        size: "large",
        "class": "text-secondary drop-shadow-sm"
      }));
      _$insert(_el$9, _$createComponent(Icon, {
        name: "trash",
        size: "large",
        "class": "text-secondary drop-shadow-sm"
      }));
      _el$0.addEventListener("change", handleInputChange);
      _$use(el => {
        iconInput = el;
      }, _el$0);
      _$insert(_el$10, () => language.t("dialog.project.edit.icon.hint"));
      _$insert(_el$11, () => language.t("dialog.project.edit.icon.recommended"));
      _$insert(_el$2, _$createComponent(Show, {
        get when() {
          return !store.iconOverride;
        },
        get children() {
          var _el$12 = _tmpl$(),
            _el$13 = _el$12.firstChild,
            _el$14 = _el$13.nextSibling;
          _$insert(_el$13, () => language.t("dialog.project.edit.color"));
          _$insert(_el$14, _$createComponent(For, {
            each: AVATAR_COLOR_KEYS,
            children: color => (() => {
              var _el$18 = _tmpl$5();
              _el$18.$$click = () => {
                if (store.color === color && !props.project.icon?.url) return;
                setStore("color", store.color === color ? undefined : color);
              };
              _$insert(_el$18, _$createComponent(Avatar, _$mergeProps({
                get fallback() {
                  return store.name || defaultName();
                }
              }, () => getAvatarColors(color), {
                "class": "size-full rounded"
              })));
              _$effect(_p$ => {
                var _v$8 = language.t("dialog.project.edit.color.select", {
                    color
                  }),
                  _v$9 = store.color === color,
                  _v$0 = {
                    "d-flex align-items-center justify-content-center size-10 p-0.5 rounded-3 overflow-hidden transition-colors cursor-default": true,
                    "bg-transparent border-2 border": store.color === color,
                    "bg-transparent border border-transparent": store.color !== color
                  };
                _v$8 !== _p$.e && _$setAttribute(_el$18, "aria-label", _p$.e = _v$8);
                _v$9 !== _p$.t && _$setAttribute(_el$18, "aria-pressed", _p$.t = _v$9);
                _p$.a = _$classList(_el$18, _v$0, _p$.a);
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined
              });
              return _el$18;
            })()
          }));
          return _el$12;
        }
      }), null);
      _$insert(_el$2, _$createComponent(TextField, {
        multiline: true,
        get label() {
          return language.t("dialog.project.edit.worktree.startup");
        },
        get description() {
          return language.t("dialog.project.edit.worktree.startup.description");
        },
        get placeholder() {
          return language.t("dialog.project.edit.worktree.startup.placeholder");
        },
        get value() {
          return store.startup;
        },
        onChange: v => setStore("startup", v),
        spellcheck: false,
        "class": "max-h-14 w-full overflow-y-auto font-mono text-xs"
      }), null);
      _$insert(_el$15, _$createComponent(Button, {
        type: "button",
        variant: "ghost",
        size: "large",
        onClick: () => dialog.close(),
        get children() {
          return language.t("common.cancel");
        }
      }), null);
      _$insert(_el$15, _$createComponent(Button, {
        type: "submit",
        variant: "primary",
        size: "large",
        get disabled() {
          return saveMutation.isPending;
        },
        get children() {
          return _$memo(() => !!saveMutation.isPending)() ? language.t("common.saving") : language.t("common.save");
        }
      }), null);
      _$effect(_p$ => {
        var _v$ = {
            "border-primary bg-info-subtle": store.dragOver,
            "border": !store.dragOver,
            "overflow-hidden": !!store.iconOverride
          },
          _v$2 = !!(store.iconHover && !store.iconOverride),
          _v$3 = !(store.iconHover && !store.iconOverride),
          _v$4 = !!(store.iconHover && !!store.iconOverride),
          _v$5 = !(store.iconHover && !!store.iconOverride);
        _p$.e = _$classList(_el$7, _v$, _p$.e);
        _v$2 !== _p$.t && _el$8.classList.toggle("opacity-100", _p$.t = _v$2);
        _v$3 !== _p$.a && _el$8.classList.toggle("opacity-0", _p$.a = _v$3);
        _v$4 !== _p$.o && _el$9.classList.toggle("opacity-100", _p$.o = _v$4);
        _v$5 !== _p$.i && _el$9.classList.toggle("opacity-0", _p$.i = _v$5);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined
      });
      return _el$;
    }
  });
}
_$delegateEvents(["click"]);