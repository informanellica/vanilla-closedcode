import { createComponent, createEffect, onCleanup } from "../../lib/reactivity.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { SessionReview } from "@/vendor/ui/components/session-review.js";
import { useLayout } from "@/context/layout.js";
import { useSessionController } from "@/controllers/session.js";
export function SessionReviewTab(props) {
  let scroll;
  let restoreFrame;
  let userInteracted = false;
  let restored;
  const layout = useLayout();
  const controller = useSessionController();
  const readFile = path => controller.readFile(path);
  const handleInteraction = () => {
    userInteracted = true;
    if (restoreFrame !== undefined) {
      cancelAnimationFrame(restoreFrame);
      restoreFrame = undefined;
    }
  };
  const doRestore = () => {
    restoreFrame = undefined;
    const el = scroll;
    if (!el || !layout.ready() || userInteracted) return;
    if (el.clientHeight === 0 || el.clientWidth === 0) return;
    const s = props.view().scroll("review");
    if (!s || s.x === 0 && s.y === 0) return;
    const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
    const targetY = Math.min(s.y, maxY);
    const targetX = Math.min(s.x, maxX);
    if (el.scrollTop === targetY && el.scrollLeft === targetX) return;
    if (el.scrollTop !== targetY) el.scrollTop = targetY;
    if (el.scrollLeft !== targetX) el.scrollLeft = targetX;
    restored = {
      x: el.scrollLeft,
      y: el.scrollTop
    };
  };
  const queueRestore = () => {
    if (userInteracted || restoreFrame !== undefined) return;
    restoreFrame = requestAnimationFrame(doRestore);
  };
  const handleScroll = event => {
    const el = event.currentTarget;
    const prev = restored;
    if (prev && el.scrollTop === prev.y && el.scrollLeft === prev.x) {
      restored = undefined;
      return;
    }
    restored = undefined;
    handleInteraction();
    if (!layout.ready()) return;
    if (el.clientHeight === 0 || el.clientWidth === 0) return;
    props.view().setScroll("review", {
      x: el.scrollLeft,
      y: el.scrollTop
    });
  };
  createEffect(() => {
    props.diffs().length;
    props.diffStyle;
    if (!layout.ready()) return;
    queueRestore();
  });
  onCleanup(() => {
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
  });
  return createComponent(SessionReview, {
    get title() {
      return props.title;
    },
    get empty() {
      return props.empty;
    },
    scrollRef: el => {
      scroll = el;
      makeEventListener(el, "wheel", handleInteraction, {
        passive: true,
        capture: true
      });
      makeEventListener(el, "mousewheel", handleInteraction, {
        passive: true,
        capture: true
      });
      makeEventListener(el, "pointerdown", handleInteraction, {
        passive: true,
        capture: true
      });
      makeEventListener(el, "touchstart", handleInteraction, {
        passive: true,
        capture: true
      });
      makeEventListener(el, "keydown", handleInteraction, {
        capture: true
      });
      props.onScrollRef?.(el);
      queueRestore();
    },
    onScroll: handleScroll,
    onDiffRendered: queueRestore,
    get open() {
      return props.view().review.open();
    },
    get onOpenChange() {
      return props.view().review.setOpen;
    },
    get classes() {
      return {
        root: props.classes?.root ?? "pr-3",
        header: props.classes?.header ?? "px-3",
        container: props.classes?.container ?? "pl-3"
      };
    },
    get diffs() {
      return props.diffs();
    },
    get diffStyle() {
      return props.diffStyle;
    },
    get onDiffStyleChange() {
      return props.onDiffStyleChange;
    },
    get onViewFile() {
      return props.onViewFile;
    },
    get focusedFile() {
      return props.focusedFile;
    },
    readFile: readFile,
    get onLineComment() {
      return props.onLineComment;
    },
    get onLineCommentUpdate() {
      return props.onLineCommentUpdate;
    },
    get onLineCommentDelete() {
      return props.onLineCommentDelete;
    },
    get lineCommentActions() {
      return props.lineCommentActions;
    },
    get lineCommentMention() {
      return props.commentMentions;
    },
    get comments() {
      return props.comments;
    },
    get focusedComment() {
      return props.focusedComment;
    },
    get onFocusedCommentChange() {
      return props.onFocusedCommentChange;
    }
  });
}