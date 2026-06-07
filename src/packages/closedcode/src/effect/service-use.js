import { Effect } from "effect";
export const serviceUse = tag => {
  // This is the only dynamic boundary: TypeScript knows the accessor shape,
  // but Proxy property names are runtime values.
  const access = new Proxy({}, {
    get: (_, key) => {
      if (typeof key !== "string") return undefined;
      return (...args) => tag.use(service => {
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Proxy keys are checked at runtime.
        const method = service[key];
        if (typeof method !== "function") return Effect.die(new Error(`Service method not found: ${key}`));
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- ServiceUse exposes only Effect-returning methods.
        return method(...args);
      });
    }
  });
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Proxy implements the mapped accessor surface lazily.
  return access;
};