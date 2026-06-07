import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="size-full d-flex flex-column"><div class="h-12 shrink-0"aria-hidden></div><div class="flex-1 px-6 pb-30 d-flex align-items-center justify-content-center text-center"><div class="w-100 max-w-200 d-flex flex-column align-items-center text-center gap-4"><div class="d-flex flex-column align-items-center gap-6"><div class="fs-5 fw-medium text-body-emphasis"></div></div><div class="w-100 d-flex flex-column gap-4 align-items-center"><div class="d-flex align-items-start justify-content-center gap-3 min-h-5"><div class="small fw-medium text-secondary select-text leading-5 min-w-0 max-w-160 break-words text-center"><span class=text-body-emphasis></span></div></div><div class="d-flex align-items-start justify-content-center gap-1.5 min-h-5"><div class="small fw-medium text-secondary select-text leading-5 min-w-0 max-w-160 break-words text-center">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-start justify-content-center gap-3 min-h-5"><div class="small fw-medium text-secondary leading-5 min-w-0 max-w-160 break-words text-center">&nbsp;<span class=text-body-emphasis>`);
import { Show, createMemo } from "solid-js";
import { DateTime } from "luxon";
import { useSync } from "@/context/sync.js";
import { useSDK } from "@/context/sdk.js";
import { useLanguage } from "@/context/language.js";
import { useSessionController } from "@/controllers/session.js";
import { Icon } from "@/bs/icon.js";
import { Mark } from "@/vendor/ui/components/logo.js";
import { getDirectory, getFilename } from "core/util/path";
const MAIN_WORKTREE = "main";
const CREATE_WORKTREE = "create";
const ROOT_CLASS = "size-full d-flex flex-column";
export function NewSessionView(props) {
  const sync = useSync();
  const sdk = useSDK();
  const language = useLanguage();
  const controller = useSessionController();
  const sandboxes = createMemo(() => sync.project?.sandboxes ?? []);
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE]);
  const current = createMemo(() => {
    const selection = props.worktree;
    if (options().includes(selection)) return selection;
    return MAIN_WORKTREE;
  });
  const projectRoot = createMemo(() => controller.projectRoot());
  const isWorktree = createMemo(() => controller.isWorktree());
  const label = value => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main");
      const branch = sync.data?.vcs?.branch;
      if (branch) return language.t("session.new.worktree.mainWithBranch", {
        branch
      });
      return language.t("session.new.worktree.main");
    }
    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create");
    return getFilename(value);
  };
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.firstChild,
      _el$7 = _el$5.nextSibling,
      _el$8 = _el$7.firstChild,
      _el$9 = _el$8.firstChild,
      _el$0 = _el$9.firstChild,
      _el$1 = _el$8.nextSibling,
      _el$10 = _el$1.firstChild;
    _$insert(_el$5, _$createComponent(Mark, {
      "class": "w-10"
    }), _el$6);
    _$insert(_el$6, () => language.t("session.new.title"));
    _$insert(_el$9, () => getDirectory(projectRoot()), _el$0);
    _$insert(_el$0, () => getFilename(projectRoot()));
    _$insert(_el$1, _$createComponent(Icon, {
      name: "branch",
      size: "small",
      "class": "mt-0.5 shrink-0"
    }), _el$10);
    _$insert(_el$10, () => label(current()));
    _$insert(_el$7, _$createComponent(Show, {
      get when() {
        return sync.project;
      },
      children: project => (() => {
        var _el$11 = _tmpl$2(),
          _el$12 = _el$11.firstChild,
          _el$13 = _el$12.firstChild,
          _el$14 = _el$13.nextSibling;
        _$insert(_el$12, () => language.t("session.new.lastModified"), _el$13);
        _$insert(_el$14, () => DateTime.fromMillis(project().time.updated ?? project().time.created).setLocale(language.intl()).toRelative());
        return _el$11;
      })()
    }), null);
    return _el$;
  })();
}