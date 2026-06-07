import { OpenApi } from "effect/unstable/httpapi";
export function described(schema, description) {
  return schema.annotate({
    description
  });
}
export function responseDescription(description) {
  return OpenApi.annotations({
    transform: operation => {
      const response = operation.responses?.["200"];
      if (response && typeof response === "object" && "description" in response) {
        response.description = description;
      }
      return operation;
    }
  });
}