export const Favicon = () => {
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
