/** @file Computes the localized placeholder text for the prompt input based on mode, pending comments, and suggestion availability. */
/**
 * Compute the localized placeholder string for the prompt input given the current input state.
 * @param {Object} input - Placeholder inputs: {mode, commentCount, suggest, example, t}, where `t` is the translate function.
 * @returns {string} The localized placeholder text.
 */
export function promptPlaceholder(input) {
  if (input.mode === "shell") return input.t("prompt.placeholder.shell", {
    example: input.example
  });
  if (input.commentCount > 1) return input.t("prompt.placeholder.summarizeComments");
  if (input.commentCount === 1) return input.t("prompt.placeholder.summarizeComment");
  if (!input.suggest) return input.t("prompt.placeholder.simple");
  return input.t("prompt.placeholder.normal", {
    example: input.example
  });
}