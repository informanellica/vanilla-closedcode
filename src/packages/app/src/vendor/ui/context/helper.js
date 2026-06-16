/** @file Factory for lightweight reactive contexts: builds a provider (optionally gated on a readiness flag) and a hook that throws if used outside the provider. */
import { createComponent, createContext, createMemo, Show, useContext } from "../../../lib/reactivity.js";
/**
 * Create a simple context with a provider component and an accessor hook.
 * @param {Object} input - Context configuration.
 * @param {string} input.name - Human-readable context name used in the "must be used within a context provider" error.
 * @param {Function} input.init - Receives the provider props and returns the context value; may expose a `ready` flag/getter for gating.
 * @param {*} input.gate - When falsy, the provider renders children immediately without waiting for readiness (defaults to `true`).
 * @returns {Object} Object with `provider` (provider component) and `use` (hook returning the context value, throwing if absent).
 */
export function createSimpleContext(input) {
  const ctx = createContext();
  return {
    /**
     * Provider component: computes the context value via `input.init` and supplies it to
     * descendants. When gating is enabled, children render only once `init.ready` resolves truthy.
     * @param {Object} props - Provider props (forwarded to `input.init`); `props.children` are the gated descendants.
     * @returns {*} The wrapped context provider component (optionally guarded by a Show).
     */
    provider: props => {
      const init = input.init(props);
      const gate = input.gate ?? true;
      if (!gate) {
        return createComponent(ctx.Provider, {
          value: init,
          get children() {
            return props.children;
          }
        });
      }

      // Access init.ready inside the memo to make it reactive for getter properties
      const isReady = createMemo(() => {
        const ready = init.ready;
        return ready === undefined || (typeof ready === "function" ? ready() : ready);
      });
      return createComponent(Show, {
        get when() {
          return isReady();
        },
        get children() {
          return createComponent(ctx.Provider, {
            value: init,
            get children() {
              return props.children;
            }
          });
        }
      });
    },
    /**
     * Hook that returns the current context value.
     * @returns {*} The context value provided by the nearest provider.
     * @throws {Error} If invoked outside of the context provider.
     */
    use() {
      const value = useContext(ctx);
      if (!value) throw new Error(`${input.name} context must be used within a context provider`);
      return value;
    }
  };
}
