/** @file Vanilla TextField component (a Kobalte-derived reimplementation): a labeled, validatable input/textarea with optional description, error, and copy-to-clipboard affordance. */
// Vanilla reimplementation of @kobalte/core's TextField behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createComponent, createRenderEffect, createSignal, splitProps } from "../../../lib/reactivity.js";
import { insert } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
import { Tooltip } from "./tooltip.js";

// Vanilla port of the original TextField wrapper. The original previously owned the
// field behavior (controllable value, the validation/readonly/disabled data
// attributes the CSS keys off, the controlled-value clamp). This rebuilds the
// same surface by hand following the bs/text-field.js house pattern: a real
// input/textarea, render effects for reactive props, the rest-props proxy
// forwarded onto the input so arbitrary attributes (type, ref, placeholder,
// spellcheck, autocomplete, ...) stay live.

// Rest props forwarded to the input/textarea: handlers bound once, attribute
// props re-applied in a render effect (they may be signal-backed getters),
// `ref` invoked once with the element.
/**
 * Forward arbitrary rest props onto the field element: bind on* handlers once, invoke ref once, and
 * reactively apply remaining attribute/property values (skipping class/classList/children).
 * @param {HTMLElement} el - The input/textarea element.
 * @param {Object} rest - The rest props bag to forward.
 * @returns {void}
 */
function applyRestProps(el, rest) {
  for (const key in rest) {
    if (key === "class" || key === "classList" || key === "children") continue;
    const value = rest[key];
    if (key === "ref") {
      if (typeof value === "function") value(el);
      continue;
    }
    if (key.startsWith("on") && typeof value === "function") {
      el[key.toLowerCase()] = value;
    }
  }
  const prev = {};
  createRenderEffect(() => {
    for (const key in rest) {
      if (key === "class" || key === "classList" || key === "children" || key === "ref") continue;
      if (key.startsWith("on") && typeof rest[key] === "function") continue;
      const value = rest[key];
      if (value === prev[key]) continue;
      prev[key] = value;
      if (value !== undefined && key in el && !key.includes("-")) {
        try {
          el[key] = value;
          continue;
        } catch {
          // fall through to the attribute path
        }
      }
      if (value == null || value === false) el.removeAttribute(key);
      else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(value));
    }
  });
}

// The original createControllableSignal: controlled when `value` is supplied,
// uncontrolled (internal, seeded from defaultValue) otherwise; onChange fires
// with the new string. Returns [read, write].
/**
 * Create a controllable value: controlled when local.value is supplied, otherwise an internal signal
 * seeded from local.defaultValue; writes call local.onChange and update internal state only when uncontrolled.
 * @param {Object} local - The local props ({ value, defaultValue, onChange }).
 * @returns {Array} A [read, write, controlled] tuple of accessors.
 */
function controllableValue(local) {
  const controlled = () => local.value !== undefined;
  const [internal, setInternal] = createSignal(local.defaultValue ?? "");
  const read = () => (controlled() ? (local.value ?? "") : internal());
  const write = next => {
    if (!controlled()) setInternal(next);
    local.onChange?.(next);
  };
  return [read, write, controlled];
}

/**
 * Auto-size a textarea to fit its content by resetting and re-measuring its scroll height.
 * @param {HTMLTextAreaElement} el - The textarea element to resize.
 * @returns {void}
 */
function adjustHeight(el) {
  const prevAlignment = el.style.alignSelf;
  const prevOverflow = el.style.overflow;
  const isFirefox = "MozAppearance" in el.style;
  if (!isFirefox) el.style.overflow = "hidden";
  el.style.alignSelf = "start";
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  el.style.overflow = prevOverflow;
  el.style.alignSelf = prevAlignment;
}

/**
 * Labeled text field: renders a role="group" wrapper with an optional label, a (single-line input or
 * multiline auto-sizing textarea) field, optional description and error slots, validation/disabled/
 * read-only data attributes the CSS keys off, and an optional copy-to-clipboard button. Supports
 * controlled or uncontrolled value; rest props are forwarded onto the field.
 * @param {Object} props - Component props.
 * @param {string} props.name - The form field name.
 * @param {string} props.defaultValue - Initial value for uncontrolled usage.
 * @param {string} props.value - Controlled value; when provided the field is controlled.
 * @param {Function} props.onChange - Called with the new value string on edit.
 * @param {Function} props.onKeyDown - Keydown handler bound to the field.
 * @param {string} props.validationState - "invalid"/"valid" to toggle validation styling.
 * @param {boolean} props.required - Whether the field is required.
 * @param {boolean} props.disabled - Whether the field is disabled.
 * @param {boolean} props.readOnly - Whether the field is read-only.
 * @param {string} props.class - Class string applied to the field element.
 * @param {*} props.label - Optional label content (sr-only when hideLabel).
 * @param {boolean} props.hideLabel - Visually hide the label (keep it for screen readers).
 * @param {*} props.description - Optional description content.
 * @param {*} props.error - Optional error message content.
 * @param {string} props.variant - Visual variant (default "normal").
 * @param {boolean} props.copyable - When true, render a copy button and copy on group click.
 * @param {string} props.copyKind - "link" to use link-flavored copy labels/icon.
 * @param {boolean} props.multiline - When true, render a textarea instead of an input.
 * @returns {HTMLElement} The text-field root element.
 */
export function TextField(props) {
  const i18n = useI18n();
  const [local, others] = splitProps(props, ["name", "defaultValue", "value", "onChange", "onKeyDown", "validationState", "required", "disabled", "readOnly", "class", "label", "hideLabel", "description", "error", "variant", "copyable", "copyKind", "multiline"]);
  const [copied, setCopied] = createSignal(false);
  const [readValue, writeValue, controlled] = controllableValue(local);

  const label = () => {
    if (copied()) return i18n.t("ui.textField.copied");
    if (local.copyKind === "link") return i18n.t("ui.textField.copyLink");
    return i18n.t("ui.textField.copyToClipboard");
  };
  const icon = () => {
    if (copied()) return "check";
    if (local.copyKind === "link") return "link";
    return "copy";
  };
  /**
   * Copy the field's current value to the clipboard and flash the copied state for 2 seconds.
   * @returns {Promise<void>} Resolves once the value has been written to the clipboard.
   */
  async function handleCopy() {
    // Controlled value wins over defaultValue; read live at click time.
    const value = local.value ?? local.defaultValue ?? readValue() ?? "";
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Build the input or textarea element with all reactive wiring.
  /**
   * Build the input (or textarea when multiline) element with all reactive wiring: rest props, class,
   * validation/disabled/read-only data attributes, value sync/clamp, input handling and auto-sizing.
   * @returns {HTMLElement} The configured input/textarea element.
   */
  function buildField() {
    const multiline = !!local.multiline;
    const el = document.createElement(multiline ? "textarea" : "input");
    el.setAttribute("data-slot", "input-input");
    if (!multiline) el.type = "text";

    // Rest props (type, placeholder, ref, spellcheck, autocomplete, ...) land
    // on the field, like the original forwarding `others` onto Input/TextArea.
    applyRestProps(el, others);

    // class + validation/readonly/disabled/required data attributes (the CSS
    // `:has([data-invalid])` / `:has([data-readonly])` select these on the
    // input). Re-applied reactively because validationState/disabled are live.
    const prevClass = { value: "" };
    createRenderEffect(() => {
      const cls = local.class;
      if (cls === prevClass.value) return;
      if (prevClass.value) el.classList.remove(...String(prevClass.value).split(/\s+/).filter(Boolean));
      if (cls) el.classList.add(...String(cls).split(/\s+/).filter(Boolean));
      prevClass.value = cls ?? "";
    });
    createRenderEffect(() => {
      const invalid = local.validationState === "invalid";
      const valid = local.validationState === "valid";
      el.toggleAttribute("data-invalid", invalid);
      el.toggleAttribute("data-valid", valid);
      el.toggleAttribute("data-required", !!local.required);
      el.toggleAttribute("data-disabled", !!local.disabled);
      el.toggleAttribute("data-readonly", !!local.readOnly);
      el.disabled = !!local.disabled;
      el.readOnly = !!local.readOnly;
      el.required = !!local.required;
      if (local.name != null) el.name = local.name;
      if (invalid) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    });

    // Value: keep the field in sync with the (controllable) value; for a
    // controlled field whose external prop did not change, the DOM is clamped
    // back, matching the original `target.value = value()` enforcement.
    createRenderEffect(() => {
      const v = readValue();
      if (el.value !== v) el.value = v ?? "";
      if (multiline) adjustHeight(el);
    });

    el.addEventListener("input", () => {
      if (local.readOnly || local.disabled) {
        el.value = readValue() ?? "";
        return;
      }
      writeValue(el.value);
      // Re-clamp a controlled field that rejected the edit.
      if (controlled()) el.value = readValue() ?? "";
      if (multiline) adjustHeight(el);
    });
    if (local.onKeyDown) el.addEventListener("keydown", e => local.onKeyDown(e));
    return el;
  }

  // Wrapper holding the input/textarea plus the optional copy affordance.
  /**
   * Build the wrapper element containing the field and, when copyable, a tooltip-wrapped copy button.
   * @returns {HTMLElement} The wrapper element.
   */
  function buildWrapper() {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-slot", "input-wrapper");
    wrapper.appendChild(buildField());
    if (local.copyable) {
      // Tooltip-wrapped copy button rendered after the input. The tooltip is
      // inserted via solid-js/web insert() so its reactive children stay live;
      // the IconButton reads icon/label once per (re)build, so we hand it the
      // current values inside the tooltip's tracked children scope — a copied()
      // flip re-runs it with a fresh icon + aria-label.
      insert(wrapper, createComponent(Tooltip, {
        get value() {
          return label();
        },
        placement: "top",
        gutter: 4,
        get forceOpen() {
          return copied();
        },
        skipDelayDuration: 0,
        get children() {
          const currentIcon = icon();
          const currentLabel = label();
          return createComponent(IconButton, {
            type: "button",
            icon: currentIcon,
            variant: "ghost",
            onClick: handleCopy,
            tabIndex: -1,
            "data-slot": "input-copy-button",
            "aria-label": currentLabel
          });
        }
      }), null);
    }
    return wrapper;
  }

  // Root: div role="group" with the formControl dataset, mirroring the original
  // TextFieldRoot. The CSS keys data-component="input" + data-variant.
  const root = document.createElement("div");
  root.setAttribute("data-component", "input");
  root.setAttribute("role", "group");
  // The compiled wrapper put onClick on the root group: clicking anywhere in
  // a copyable field copies the value (matches the original handleClick).
  root.addEventListener("click", () => {
    if (local.copyable) void handleCopy();
  });
  createRenderEffect(() => {
    root.setAttribute("data-variant", local.variant || "normal");
    root.toggleAttribute("data-invalid", local.validationState === "invalid");
    root.toggleAttribute("data-valid", local.validationState === "valid");
    root.toggleAttribute("data-required", !!local.required);
    root.toggleAttribute("data-disabled", !!local.disabled);
    root.toggleAttribute("data-readonly", !!local.readOnly);
  });

  // Label (only when present); sr-only when hideLabel.
  if (local.label != null && local.label !== false) {
    const labelEl = document.createElement("label");
    labelEl.setAttribute("data-slot", "input-label");
    if (local.hideLabel) labelEl.classList.add("sr-only");
    // label may be a reactive value; track it.
    createRenderEffect(() => {
      labelEl.textContent = local.label == null || local.label === false ? "" : String(local.label);
    });
    root.appendChild(labelEl);
  }

  root.appendChild(buildWrapper());

  // Description (only when present).
  if (local.description != null && local.description !== false) {
    const desc = document.createElement("div");
    desc.setAttribute("data-slot", "input-description");
    createRenderEffect(() => {
      desc.textContent = local.description == null || local.description === false ? "" : String(local.description);
    });
    root.appendChild(desc);
  }

  // Error message: always present (matches the original ErrorMessage slot), text
  // tracked so it appears/clears reactively.
  const errorEl = document.createElement("div");
  errorEl.setAttribute("data-slot", "input-error");
  createRenderEffect(() => {
    errorEl.textContent = local.error == null || local.error === false ? "" : String(local.error);
  });
  root.appendChild(errorEl);

  return root;
}
