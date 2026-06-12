// First-party stand-in for @solidjs/meta's MetaProvider. Stage R3 of the
// solid-free reactivity milestone. The app mounts <MetaProvider> at the root
// but uses NO Title/Meta/Link/Style children anywhere — the window title is set
// imperatively via window.api.setTitlebar, not through meta tags. So the
// provider's document.head management never runs, and a pass-through that simply
// renders its children is behavior-identical. (If Title/Meta are introduced
// later, port the real provider's head-tag management here.)
export function MetaProvider(props) {
  return props.children;
}
