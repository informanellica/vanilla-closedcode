import { createComponent, createRenderEffect } from "solid-js";
import { Button } from "@/bs/button.js";
import { DockPrompt } from "@/vendor/ui/components/dock-prompt.js";
import { Icon } from "@/bs/icon.js";
import { useLanguage } from "@/context/language.js";

// Build a detached element from static markup. Only static skeletons go
// through here; translated/user strings are assigned via textContent.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export function SessionPermissionDock(props) {
  const language = useLanguage();
  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`;
    const value = language.t(key);
    if (value === key) return "";
    return value;
  };

  // Header row: built once; the title tracks the locale through its own
  // effect, so the DockPrompt header slot never re-renders.
  const header = template(`<div data-slot="permission-row" data-variant="header"><span data-slot="permission-icon"></span><div data-slot="permission-header-title"></div></div>`);
  header.querySelector('[data-slot="permission-icon"]').appendChild(createComponent(Icon, {
    name: "warning",
    size: "normal"
  }));
  const headerTitle = header.querySelector('[data-slot="permission-header-title"]');
  createRenderEffect(() => {
    headerTitle.textContent = language.t("notification.permission.title");
  });

  // Description row (Show equivalent): mounted only while a translation
  // exists; the text itself updates in place so the row is never remounted
  // on a truthy-to-truthy change.
  const hintSlot = template(`<div style="display: contents"></div>`);
  const hintRow = template(`<div data-slot="permission-row"><span data-slot="permission-spacer" aria-hidden="true"></span><div data-slot="permission-hint"></div></div>`);
  const hintText = hintRow.querySelector('[data-slot="permission-hint"]');
  createRenderEffect(() => {
    const text = toolDescription();
    hintText.textContent = text;
    const mounted = hintRow.parentNode === hintSlot;
    if (text && !mounted) hintSlot.appendChild(hintRow);
    else if (!text && mounted) hintRow.remove();
  });

  // Patterns row (Show + For equivalent): the scrollable container stays
  // mounted across list updates so its scroll position is preserved; only
  // the <code> entries are rebuilt.
  const patternsSlot = template(`<div style="display: contents"></div>`);
  const patternsRow = template(`<div data-slot="permission-row"><span data-slot="permission-spacer" aria-hidden="true"></span><div data-slot="permission-patterns"></div></div>`);
  const patternsList = patternsRow.querySelector('[data-slot="permission-patterns"]');
  createRenderEffect(() => {
    const patterns = props.request.patterns;
    patternsList.replaceChildren(...patterns.map(pattern => {
      const code = document.createElement("code");
      code.className = "small fw-normal text-body break-all";
      code.textContent = pattern;
      return code;
    }));
    const mounted = patternsRow.parentNode === patternsSlot;
    if (patterns.length > 0 && !mounted) patternsSlot.appendChild(patternsRow);
    else if (patterns.length === 0 && mounted) patternsRow.remove();
  });

  const decideButton = (variant, decision, label) => createComponent(Button, {
    variant: variant,
    size: "normal",
    onClick: () => props.onDecide(decision),
    get disabled() {
      return props.responding;
    },
    get children() {
      return language.t(label);
    }
  });

  return createComponent(DockPrompt, {
    kind: "permission",
    header: header,
    // Built inside the getter (like the compiled output) so the labels are
    // read within the tray's render effect and follow locale changes; the
    // leading empty div keeps the actions pushed right by the footer's
    // space-between layout.
    get footer() {
      const actions = template(`<div data-slot="permission-footer-actions"></div>`);
      actions.append(
        decideButton("ghost", "reject", "ui.permission.deny"),
        decideButton("secondary", "always", "ui.permission.allowAlways"),
        decideButton("primary", "once", "ui.permission.allowOnce")
      );
      return [document.createElement("div"), actions];
    },
    children: [hintSlot, patternsSlot]
  });
}
