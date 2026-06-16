/** @file Builds the floating "+" hover button that lets a user start a comment on the diff line currently under the pointer. */

/**
 * Creates the floating add-comment button shown on hover over a diff line.
 * The button tracks the hovered line via requestAnimationFrame and pointer events,
 * and invokes the supplied callback with that line when clicked.
 * @param {Object} props - Configuration for the button.
 * @param {string} props.label - Accessible aria-label text for the button.
 * @param {Function} props.getHoveredLine - Returns the currently hovered line descriptor, or a falsy value when none.
 * @param {Function} props.onSelect - Called with the chosen line when the button is activated.
 * @returns {HTMLButtonElement} The constructed button element, or undefined when there is no DOM (SSR).
 */
export function createHoverCommentUtility(props) {
  if (typeof document === "undefined") return;
  const button = document.createElement("button");
  button.type = "button";
  button.ariaLabel = props.label;
  button.textContent = "+";
  button.style.width = "20px";
  button.style.height = "20px";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.border = "none";
  button.style.borderRadius = "var(--radius-md)";
  button.style.background = "var(--icon-interactive-base)";
  button.style.color = "var(--white)";
  button.style.boxShadow = "var(--shadow-xs)";
  button.style.fontSize = "14px";
  button.style.lineHeight = "1";
  button.style.cursor = "pointer";
  button.style.position = "relative";
  button.style.left = "30px";
  button.style.top = "calc((var(--diffs-line-height, 24px) - 20px) / 2)";
  let line;
  const sync = () => {
    const next = props.getHoveredLine();
    if (!next) return;
    line = next;
  };
  const loop = () => {
    if (!button.isConnected) return;
    sync();
    requestAnimationFrame(loop);
  };
  const open = () => {
    const next = props.getHoveredLine() ?? line;
    if (!next) return;
    props.onSelect(next);
  };
  requestAnimationFrame(loop);
  button.addEventListener("mouseenter", sync);
  button.addEventListener("mousemove", sync);
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    sync();
  });
  button.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();
    sync();
  });
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  return button;
}