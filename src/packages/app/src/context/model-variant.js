/** @file Pure helpers for resolving, validating, and cycling model "variants" (e.g. reasoning levels) given an agent config, the active model, and the user's selection. */
/**
 * Returns the agent's configured variant only if it actually applies to the given model.
 * The variant is honored only when the agent pins the same provider/model and that model exposes the variant.
 * @param {Object} input - Has `agent` ({variant, model: {providerID, modelID}}) and `model` ({providerID, modelID, variants}).
 * @returns {string} The applicable variant name, or undefined when it does not apply.
 */
export function getConfiguredAgentVariant(input) {
  if (!input.agent?.variant) return undefined;
  if (!input.agent.model) return undefined;
  if (!input.model?.variants) return undefined;
  if (input.agent.model.providerID !== input.model.providerID) return undefined;
  if (input.agent.model.modelID !== input.model.modelID) return undefined;
  if (!(input.agent.variant in input.model.variants)) return undefined;
  return input.agent.variant;
}
/**
 * Resolves the effective variant for a model from the user's selection and the configured default.
 * An explicit null selection means "no variant"; otherwise the selection wins, then the configured default, if either is in the model's variant list.
 * @param {Object} input - Has `variants` (Array of variant names), `selected` (selected variant, null, or undefined), and `configured` (configured default variant).
 * @returns {string} The resolved variant name, or undefined when none applies.
 */
export function resolveModelVariant(input) {
  if (input.selected === null) return undefined;
  if (input.selected && input.variants.includes(input.selected)) return input.selected;
  if (input.configured && input.variants.includes(input.configured)) return input.configured;
  return undefined;
}
/**
 * Computes the next variant when cycling through a model's variants (e.g. on a keyboard toggle).
 * Cycling starts from the current selection (or the configured default), advances through the list, and wraps via an "off" (undefined) state.
 * @param {Object} input - Has `variants` (Array of variant names), `selected` (selected variant, null, or undefined), and `configured` (configured default variant).
 * @returns {string} The next variant name, or undefined to represent the "off"/no-variant state.
 */
export function cycleModelVariant(input) {
  if (input.variants.length === 0) return undefined;
  if (input.selected === null) return input.variants[0];
  if (input.selected && input.variants.includes(input.selected)) {
    const index = input.variants.indexOf(input.selected);
    if (index === input.variants.length - 1) return undefined;
    return input.variants[index + 1];
  }
  if (input.configured && input.variants.includes(input.configured)) {
    const index = input.variants.indexOf(input.configured);
    if (index === input.variants.length - 1) return input.variants[0];
    return input.variants[index + 1];
  }
  return input.variants[0];
}