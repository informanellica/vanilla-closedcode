import { createSimpleContext } from "./helper.js";
export const {
  use: useData,
  provider: DataProvider
} = createSimpleContext({
  name: "Data",
  init: props => {
    return {
      get store() {
        return props.data;
      },
      get directory() {
        return props.directory;
      },
      navigateToSession: props.onNavigateToSession,
      sessionHref: props.onSessionHref
    };
  }
});