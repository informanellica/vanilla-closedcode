import { AsyncLocalStorage } from "async_hooks";
export class NotFound extends Error {
  constructor(name) {
    super(`No context found for ${name}`);
    this.name = name;
  }
}
export function create(name) {
  const storage = new AsyncLocalStorage();
  return {
    use() {
      const result = storage.getStore();
      if (!result) {
        throw new NotFound(name);
      }
      return result;
    },
    provide(value, fn) {
      return storage.run(value, fn);
    }
  };
}
export * as LocalContext from "./local-context.js";