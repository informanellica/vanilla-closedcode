/** @file Builds a Proxy-based accessor that exposes a service's Effect-returning methods as callable functions resolved via the service tag. */
import { Effect } from "effect";
/**
 * Create a lazy accessor over a service tag: each property access returns a function
 * that invokes the same-named method on the resolved service, returning its Effect.
 * @param {Object} tag - The service tag (must expose a `use` combinator).
 * @returns {Object} Proxy whose properties are functions returning Effects.
 */
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