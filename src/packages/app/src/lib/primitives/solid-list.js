// First-party port of `solid-list`'s `createList` export.
//
// This is a faithful reimplementation of the subset of `solid-list@0.3.0`
// (https://corvu.dev/docs/utilities/list) that this app actually uses. The two
// call sites (lib/hooks.js and vendor/ui/hooks/use-filtered-list.js) only ever
// pass `{ items, initialActive, loop }` and read `active`, `setActive` and
// `onKeyDown` off the returned object, so the vim-mode / text-direction /
// horizontal-orientation / tab-handling branches are kept here for parity but
// are not exercised by those call sites.
//
// Two tiny upstream helpers are inlined to keep this module dependency-free
// (importing only from "../reactivity.js"):
//   - `access` from `@corvu/utils/reactivity`
//   - `createControllableSignal` from `@corvu/utils/create/controllableSignal`
//
// Behavior matches the upstream packages on the real solid-js runtime.
//
// Port/derivative of solid-list and @corvu/utils (both MIT License,
// Copyright (c) 2023-2024 Jasmin Noetzli). See THIRD-PARTY-NOTICES.md.
import { createSignal, mergeProps, untrack } from "../reactivity.js";

// Inlined from `@corvu/utils/reactivity` (`access`): unwrap a value that may be
// either a static value or a zero-arg accessor function.
const access = (v) => (typeof v === "function" ? v() : v);

// Inlined from `@corvu/utils/create/controllableSignal`.
//
// Returns a `[value, setValue]` pair that mirrors solid-js's `createSignal`
// API but supports being externally controlled: when `props.value` is provided
// and returns a defined value the signal reflects that controlled value;
// otherwise it falls back to internal (uncontrolled) state seeded with
// `props.initialValue`. `props.onChange` fires whenever the value actually
// changes (compared with `Object.is`). All mutation happens inside `untrack`
// so reading the current value while setting does not create dependencies.
const createControllableSignal = (props) => {
  const [uncontrolledSignal, setUncontrolledSignal] = createSignal(
    props.initialValue,
  );
  const isControlled = () => props.value?.() !== undefined;
  const value = () => (isControlled() ? props.value?.() : uncontrolledSignal());
  const setValue = (next) => {
    return untrack(() => {
      let nextValue;
      if (typeof next === "function") {
        nextValue = next(value());
      } else {
        nextValue = next;
      }
      if (!Object.is(nextValue, value())) {
        if (!isControlled()) {
          setUncontrolledSignal(nextValue);
        }
        props.onChange?.(nextValue);
      }
      return nextValue;
    });
  };
  return [value, setValue];
};

// Port of `solid-list`'s `createList`. Creates an accessible, keyboard
// navigable list driven by an `active` item. `props.items` is an accessor (or
// static value) of the list of item keys; navigation keys move `active`
// through them, optionally looping at the ends.
const createList = (props) => {
  const defaultedProps = mergeProps(
    {
      initialActive: null,
      orientation: "vertical",
      loop: true,
      textDirection: "ltr",
      handleTab: true,
      vimMode: false,
      vimKeys: {
        up: "k",
        down: "j",
        right: "l",
        left: "h",
      },
    },
    props,
  );
  const [active, setActive] = createControllableSignal({
    initialValue: defaultedProps.initialActive,
    onChange: defaultedProps.onActiveChange,
  });
  const nextKeys = () => {
    const vimKeys = access(defaultedProps.vimKeys);
    let arrowKey;
    let vimKey;
    if (access(defaultedProps.orientation) === "vertical") {
      arrowKey = "arrowdown";
      vimKey = vimKeys.down;
    } else if (access(defaultedProps.textDirection) === "ltr") {
      arrowKey = "arrowright";
      vimKey = vimKeys.right;
    } else {
      arrowKey = "arrowleft";
      vimKey = vimKeys.left;
    }
    return access(defaultedProps.vimMode) ? [arrowKey, vimKey] : [arrowKey];
  };
  const previousKeys = () => {
    const vimKeys = access(defaultedProps.vimKeys);
    let arrowKey;
    let vimKey;
    if (access(defaultedProps.orientation) === "vertical") {
      arrowKey = "arrowup";
      vimKey = vimKeys.up;
    } else if (access(defaultedProps.textDirection) === "ltr") {
      arrowKey = "arrowleft";
      vimKey = vimKeys.left;
    } else {
      arrowKey = "arrowright";
      vimKey = vimKeys.right;
    }
    return access(defaultedProps.vimMode) ? [arrowKey, vimKey] : [arrowKey];
  };
  const onKeyDown = (event) => {
    const eventKey = event.key.toLowerCase();
    const resolvedItems = access(defaultedProps.items);
    if (resolvedItems.length === 0) return;
    const itemCount = resolvedItems.length;
    const activeValue = active();
    const activeIndex = activeValue !== null ? resolvedItems.indexOf(activeValue) : null;
    if (nextKeys().includes(eventKey)) {
      event.preventDefault();
      if (activeIndex === itemCount - 1) {
        if (access(defaultedProps.loop)) {
          setActive(() => resolvedItems[0]);
        }
      } else {
        setActive(() => resolvedItems[activeIndex !== null ? activeIndex + 1 : 0]);
      }
    } else if (previousKeys().includes(eventKey)) {
      event.preventDefault();
      if (activeIndex === 0) {
        if (access(defaultedProps.loop)) {
          setActive(() => resolvedItems[itemCount - 1]);
        }
      } else {
        setActive(
          () => resolvedItems[activeIndex !== null ? activeIndex - 1 : itemCount - 1],
        );
      }
    } else if (eventKey === "home") {
      event.preventDefault();
      setActive(() => resolvedItems[0]);
    } else if (eventKey === "end") {
      event.preventDefault();
      setActive(() => resolvedItems[itemCount - 1]);
    } else if (access(defaultedProps.handleTab) && activeIndex !== null) {
      if (eventKey === "tab" && !event.shiftKey && activeIndex < itemCount - 1) {
        event.preventDefault();
        setActive(() => resolvedItems[activeIndex + 1]);
      }
      if (eventKey === "tab" && event.shiftKey && activeIndex > 0) {
        event.preventDefault();
        setActive(() => resolvedItems[activeIndex - 1]);
      }
    }
  };
  return { active, setActive, onKeyDown };
};

export { createList };
