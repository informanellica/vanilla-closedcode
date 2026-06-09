function appendChildren(parent, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    appendChildren(parent, children());
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

export const TextShimmer = props => {
  const swap = 220;
  const active = props.active ?? true;
  const text = props.text ?? "";
  const offset = props.offset ?? 0;
  const outer = document.createElement(props.as || "span");
  const base = document.createElement("span");
  const shimmer = document.createElement("span");

  outer.setAttribute("data-component", "text-shimmer");
  outer.setAttribute("aria-label", text);
  outer.setAttribute("data-active", active ? "true" : "false");
  outer.className = props.class || "";
  outer.style.setProperty("--text-shimmer-swap", `${swap}ms`);
  outer.style.setProperty("--text-shimmer-index", `${offset}`);

  base.setAttribute("data-slot", "text-shimmer-char");
  base.setAttribute("aria-hidden", "true");
  base.setAttribute("data-run", active ? "true" : "false");

  shimmer.setAttribute("data-slot", "text-shimmer-char");
  shimmer.setAttribute("aria-hidden", "true");
  shimmer.setAttribute("data-run", active ? "true" : "false");

  appendChildren(base, text);
  appendChildren(shimmer, text);
  outer.appendChild(base);
  outer.appendChild(shimmer);

  if (!active) {
    setTimeout(() => {
      base.setAttribute("data-run", "false");
      shimmer.setAttribute("data-run", "false");
    }, swap);
  }

  return outer;
};
