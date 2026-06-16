/** @file Keeps the file-tab strip scrolled sensibly: auto-scrolls to a newly added tab and converts vertical wheel into horizontal scroll. */

/**
 * Compute the target scrollLeft for the tab strip after a change, or undefined to leave it untouched.
 * Scrolls to the start when the context panel just opened, otherwise scrolls to the end
 * to reveal a newly added tab (only when the strip actually overflows and grew).
 * @param {Object} input - Measurements: scrollWidth, prevScrollWidth, clientWidth, contextOpen, prevContextOpen.
 * @returns {number} The desired scrollLeft, or undefined when no scroll should occur.
 */
export const nextTabListScrollLeft = input => {
  if (input.scrollWidth <= input.prevScrollWidth) return;
  if (!input.prevContextOpen && input.contextOpen) return 0;
  if (input.scrollWidth <= input.clientWidth) return;
  return input.scrollWidth - input.clientWidth;
};
/**
 * Wire up auto-scroll and wheel handling for the tab-strip element.
 * Observes child-list mutations to re-evaluate scroll position and translates
 * dominant vertical wheel deltas into horizontal scrolling.
 * @param {Object} input - { el: the scrollable strip element, contextOpen: accessor returning whether the context panel is open }.
 * @returns {Function} A cleanup function that detaches listeners and observers.
 */
export const createFileTabListSync = input => {
  let frame;
  let prevScrollWidth = input.el.scrollWidth;
  let prevContextOpen = input.contextOpen();
  const update = () => {
    const scrollWidth = input.el.scrollWidth;
    const clientWidth = input.el.clientWidth;
    const contextOpen = input.contextOpen();
    const left = nextTabListScrollLeft({
      prevScrollWidth,
      scrollWidth,
      clientWidth,
      prevContextOpen,
      contextOpen
    });
    if (left !== undefined) {
      input.el.scrollTo({
        left,
        behavior: "smooth"
      });
    }
    prevScrollWidth = scrollWidth;
    prevContextOpen = contextOpen;
  };
  const schedule = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = undefined;
      update();
    });
  };
  const onWheel = e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    input.el.scrollLeft += e.deltaY > 0 ? 50 : -50;
    e.preventDefault();
  };
  input.el.addEventListener("wheel", onWheel, {
    passive: false
  });
  const observer = new MutationObserver(schedule);
  observer.observe(input.el, {
    childList: true
  });
  return () => {
    input.el.removeEventListener("wheel", onWheel);
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
};