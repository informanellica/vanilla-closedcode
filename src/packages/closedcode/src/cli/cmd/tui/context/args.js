import { createSimpleContext } from "./helper.js";
export const {
  use: useArgs,
  provider: ArgsProvider
} = createSimpleContext({
  name: "Args",
  init: props => props
});