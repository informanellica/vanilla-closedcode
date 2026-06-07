import { createSignal } from "solid-js";
const [all, setAll] = createSignal([]);
const [active, setActive] = createSignal(undefined);
const [reviewOpen, setReviewOpen] = createSignal(false);
const tabs = {
  all,
  active,
  open(tab) {
    setAll(current => current.includes(tab) ? current : [...current, tab]);
  },
  setActive(tab) {
    if (!all().includes(tab)) {
      tabs.open(tab);
    }
    setActive(tab);
  }
};
const view = {
  reviewPanel: {
    opened: reviewOpen,
    open() {
      setReviewOpen(true);
    }
  }
};
export function useLayout() {
  return {
    tabs: () => tabs,
    view: () => view,
    fileTree: {
      setTab() {}
    },
    handoff: {
      setTabs() {}
    }
  };
}