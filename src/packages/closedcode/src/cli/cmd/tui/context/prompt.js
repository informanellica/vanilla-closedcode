import { createSimpleContext } from "./helper.js";
export const {
  use: usePromptRef,
  provider: PromptRefProvider
} = createSimpleContext({
  name: "PromptRef",
  init: () => {
    let current;
    return {
      get current() {
        return current;
      },
      set(ref) {
        current = ref;
      }
    };
  }
});