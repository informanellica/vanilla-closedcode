let nav;
export const setNavigate = fn => {
  nav = fn;
};
export const handleNotificationClick = href => {
  window.focus();
  if (!href) return;
  if (nav) return nav(href);
  console.warn("notification-click: navigate function not set, falling back to window.location.assign");
  window.location.assign(href);
};