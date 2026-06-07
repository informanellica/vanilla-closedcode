import z from "zod";
export class NamedError extends Error {
  static hasName(error, name) {
    return typeof error === "object" && error !== null && "name" in error && error.name === name;
  }
  static create(name, data) {
    const schema = z.object({
      name: z.literal(name),
      data
    }).meta({
      ref: name
    });
    const result = class extends NamedError {
      static Schema = schema;
      name = name;
      constructor(data, options) {
        super(name, options);
        this.data = data;
        this.name = name;
      }
      static isInstance(input) {
        return typeof input === "object" && "name" in input && input.name === name;
      }
      schema() {
        return schema;
      }
      toObject() {
        return {
          name: name,
          data: this.data
        };
      }
    };
    Object.defineProperty(result, "name", {
      value: name
    });
    return result;
  }
  static Unknown = NamedError.create("UnknownError", z.object({
    message: z.string()
  }));
}