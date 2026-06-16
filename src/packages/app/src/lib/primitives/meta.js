// First-party stand-in for @solidjs/meta's MetaProvider. Stage R3 of the
// solid-free reactivity milestone. The app mounts <MetaProvider> at the root
// but uses NO Title/Meta/Link/Style children anywhere — the window title is set
// imperatively via window.api.setTitlebar, not through meta tags. So the
// provider's document.head management never runs, and a pass-through that simply
// renders its children is behavior-identical. (If Title/Meta are introduced
// later, port the real provider's head-tag management here.)
//
// Derivative of @solidjs/meta (MIT License, Copyright (c) Ryan Carniato).
// See THIRD-PARTY-NOTICES.md.

/** @file First-party pass-through stand-in for @solidjs/meta's MetaProvider (no head-tag management needed in this app). */

/**
 * Pass-through replacement for @solidjs/meta's MetaProvider. Since the app never
 * uses Title/Meta/Link/Style children, it simply renders its children unchanged.
 *
 * @param {Object} props - Component props.
 * @param {*} props.children - Child nodes rendered as-is.
 * @returns {*} The provider's children.
 */
export function MetaProvider(props) {
  return props.children;
}
