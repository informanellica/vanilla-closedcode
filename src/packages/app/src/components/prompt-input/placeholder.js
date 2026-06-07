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