/** @file Favicon component producing the document head link/meta tags for app icons. */

/**
 * Build the favicon-related <link>/<meta> head elements for the app.
 * @returns {Array} An array of HTMLElement head nodes (icon links, manifest, apple-touch icon, web-app title).
 */
export const Favicon = () => {
  /**
   * Create an element of the given tag with the supplied attributes set.
   * @param {string} tag - The element tag name (e.g. "link" or "meta").
   * @param {Object} attrs - A map of attribute names to values.
   * @returns {HTMLElement} The created element.
   */
  const icon = (tag, attrs) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  };

  return [
    icon("link", { rel: "icon", type: "image/png", href: "/favicon-96x96-v3.png", sizes: "96x96" }),
    icon("link", { rel: "shortcut icon", href: "/favicon-v3.ico" }),
    icon("link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-v3.png" }),
    icon("link", { rel: "manifest", href: "/site.webmanifest" }),
    icon("meta", { name: "apple-mobile-web-app-title", content: "ClosedCode" })
  ];
};
