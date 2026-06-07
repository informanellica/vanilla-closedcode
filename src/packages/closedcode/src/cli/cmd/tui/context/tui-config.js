import { createSimpleContext } from "./helper.js";
export const {
  use: useTuiConfig,
  provider: TuiConfigProvider
} = createSimpleContext({
  name: "TuiConfig",
  init: props => {
    return props.config;
  }
});