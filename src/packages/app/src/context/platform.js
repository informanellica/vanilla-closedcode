import { createSimpleContext } from "@/lib/context.js";
export const {
  use: usePlatform,
  provider: PlatformProvider
} = createSimpleContext({
  name: "Platform",
  init: props => {
    return props.value;
  }
});