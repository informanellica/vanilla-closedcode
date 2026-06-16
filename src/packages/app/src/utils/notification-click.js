/** @file Routes desktop notification clicks to the app router (or window.location fallback). */
let nav;
/**
 * Register the navigate function used to handle notification clicks.
 * @param {Function} fn - The router navigate function, called with a target href.
 * @returns {void}
 */
export const setNavigate = fn => {
  nav = fn;
};
/**
 * Focus the window and navigate to the notification's target href, falling back
 * to window.location.assign when no navigate function has been registered.
 * @param {string} href - The destination to navigate to; if falsy, only focuses the window.
 * @returns {*} The result of the registered navigate function, or undefined.
 */
export const handleNotificationClick = href => {
  window.focus();
  if (!href) return;
  if (nav) return nav(href);
  console.warn("notification-click: navigate function not set, falling back to window.location.assign");
  window.location.assign(href);
};