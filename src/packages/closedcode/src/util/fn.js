import { z } from "zod";
export function fn(schema, cb) {
  const result = input => {
    let parsed;
    try {
      parsed = schema.parse(input);
    } catch (e) {
      console.trace("schema validation failure stack trace:");
      if (e instanceof z.ZodError) {
        console.error("schema validation issues:", JSON.stringify(e.issues, null, 2));
      }
      throw e;
    }
    return cb(parsed);
  };
  result.force = input => cb(input);
  result.schema = schema;
  return result;
}