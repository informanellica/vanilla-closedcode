import { createComponent as _$createComponent } from "solid-js/web";
import { Link, Meta } from "@solidjs/meta";
export const Favicon = () => {
  return [_$createComponent(Link, {
    rel: "icon",
    type: "image/png",
    href: "/favicon-96x96-v3.png",
    sizes: "96x96"
  }), _$createComponent(Link, {
    rel: "shortcut icon",
    href: "/favicon-v3.ico"
  }), _$createComponent(Link, {
    rel: "apple-touch-icon",
    sizes: "180x180",
    href: "/apple-touch-icon-v3.png"
  }), _$createComponent(Link, {
    rel: "manifest",
    href: "/site.webmanifest"
  }), _$createComponent(Meta, {
    name: "apple-mobile-web-app-title",
    content: "ClosedCode"
  })];
};