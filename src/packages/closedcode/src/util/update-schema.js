import z from "zod";
export function updateSchema(schema) {
  const next = {};
  for (const [k, v] of Object.entries(schema.required().shape)) {
    next[k] = v.nullable();
  }
  return z.object(next);
}