/** @file Bootstrap labelled text input field with optional error message (vanilla reimplementation). */

/**
 * Renders a labelled single-line text input wrapped in a container, with
 * optional label and inline error message.
 * @param {Object} props - Component props. Recognized keys: `onChange` (called
 *   with the input's current value string on every input event), `variant`
 *   (data-variant attribute; default "normal"), `validationState` ("invalid"
 *   adds the Bootstrap `is-invalid` class), `class` (extra classes on the
 *   input), `type` (input type; default "text"), `placeholder`, `value`,
 *   `name`, `disabled`, `readOnly`, `required`, `spellcheck`, `autocomplete`,
 *   `autocorrect`, `autocapitalize`, `label` (label text), `hideLabel`
 *   (boolean; suppresses the label), and `error` (inline error message text).
 * @returns {HTMLElement} The wrapper `<div>` containing the label, input, and
 *   optional error element.
 */
export function TextField(props) {
  const handleInput = e => {
    props.onChange?.(e.currentTarget.value);
  };

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-component", "input");
  wrapper.setAttribute("data-variant", props.variant || "normal");

  const input = document.createElement("input");
  input.className = "form-control" + (props.validationState === "invalid" ? " is-invalid" : "") + (props.class ? " " + props.class : "");
  input.type = props.type || "text";
  input.placeholder = props.placeholder ?? "";
  input.value = props.value ?? "";
  input.name = props.name;
  input.disabled = props.disabled;
  input.readOnly = props.readOnly;
  input.required = props.required;
  input.spellcheck = props.spellcheck;
  input.autocomplete = props.autocomplete;
  input.autocorrect = props.autocorrect;
  input.autocapitalize = props.autocapitalize;
  input.addEventListener("input", handleInput);

  if (!props.hideLabel && props.label) {
    const label = document.createElement("label");
    label.className = "form-label";
    label.textContent = props.label;
    wrapper.appendChild(label);
  }

  wrapper.appendChild(input);

  if (props.error) {
    const errorEl = document.createElement("div");
    errorEl.className = "text-danger small mt-1";
    errorEl.textContent = props.error;
    wrapper.appendChild(errorEl);
  }

  return wrapper;
}
