import { createStore, reconcile } from "solid-js/store";
import { createSimpleContext } from "./helper.js";
export const {
  use: useRoute,
  provider: RouteProvider
} = createSimpleContext({
  name: "Route",
  init: props => {
    const [store, setStore] = createStore(props.initialRoute ?? (process.env["CLOSEDCODE_ROUTE"] ? JSON.parse(process.env["CLOSEDCODE_ROUTE"]) : {
      type: "home"
    }));
    return {
      get data() {
        return store;
      },
      navigate(route) {
        setStore(reconcile(route));
      }
    };
  }
});
export function useRouteData(type) {
  const route = useRoute();
  return route.data;
}