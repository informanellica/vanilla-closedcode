/** @file Platform context: exposes the host-platform abstraction (notifications, storage, etc.) provided at the app root via `props.value`. */
import { createSimpleContext } from "@/lib/context.js";
/**
 * Platform context. The provider simply re-exposes the platform object passed in as `props.value`,
 * and `usePlatform` returns it to consumers.
 */
export const {
  use: usePlatform,
  provider: PlatformProvider
} = createSimpleContext({
  name: "Platform",
  init: props => {
    return props.value;
  }
});