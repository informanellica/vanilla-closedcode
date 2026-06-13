import { createMemo } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { DateTime } from "luxon";
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda";
import { createSimpleContext } from "@/lib/context.js";
import { useProviders } from "@/hooks/use-providers.js";
import { Persist, persisted } from "@/utils/persist.js";
const RECENT_LIMIT = 5;
function modelKey(model) {
  return `${model.providerID}:${model.modelID}`;
}
export const {
  use: useModels,
  provider: ModelsProvider
} = createSimpleContext({
  name: "Models",
  init: () => {
    const providers = useProviders();
    const [store, setStore, _, ready] = persisted(Persist.global("model", ["model.v1"]), createStore({
      user: [],
      recent: [],
      variant: {}
    }));
    const available = createMemo(() => providers.connected().flatMap(p => Object.values(p.models).map(m => ({
      ...m,
      provider: p
    }))));
    const release = createMemo(() => new Map(available().map(model => {
      const parsed = DateTime.fromISO(model.release_date);
      return [modelKey({
        providerID: model.provider.id,
        modelID: model.id
      }), parsed];
    })));
    const latest = createMemo(() => pipe(available(), filter(x => Math.abs((release().get(modelKey({
      providerID: x.provider.id,
      modelID: x.id
    })) ?? DateTime.invalid("invalid")).diffNow().as("months")) < 6), groupBy(x => x.provider.id), mapValues(models => pipe(models, groupBy(x => x.family), values(), groups => groups.flatMap(g => {
      const first = firstBy(g, [x => x.release_date, "desc"]);
      return first ? [{
        modelID: first.id,
        providerID: first.provider.id
      }] : [];
    }))), values(), flat()));
    const latestSet = createMemo(() => new Set(latest().map(x => modelKey(x))));
    const visibility = createMemo(() => {
      const map = new Map();
      for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility);
      return map;
    });
    const list = createMemo(() => available().map(m => ({
      ...m,
      name: m.name.replace("(latest)", "").trim(),
      latest: m.name.includes("(latest)")
    })));
    const find = key => list().find(m => m.id === key.modelID && m.provider.id === key.providerID);
    function update(model, state) {
      const index = store.user.findIndex(x => x.modelID === model.modelID && x.providerID === model.providerID);
      if (index >= 0) {
        setStore("user", index, current => ({
          ...current,
          visibility: state
        }));
        return;
      }
      setStore("user", store.user.length, {
        ...model,
        visibility: state
      });
    }
    const visible = model => {
      const key = modelKey(model);
      const state = visibility().get(key);
      if (state === "hide") return false;
      if (state === "show") return true;
      if (latestSet().has(key)) return true;
      const date = release().get(key);
      if (!date?.isValid) return true;
      return false;
    };
    const setVisibility = (model, state) => {
      update(model, state ? "show" : "hide");
    };
    const push = model => {
      const uniq = uniqueBy([model, ...store.recent], x => `${x.providerID}:${x.modelID}`);
      if (uniq.length > RECENT_LIMIT) uniq.pop();
      setStore("recent", uniq);
    };
    const variantKey = model => `${model.providerID}/${model.modelID}`;
    const getVariant = model => store.variant?.[variantKey(model)];
    const setVariant = (model, value) => {
      const key = variantKey(model);
      if (!store.variant) {
        setStore("variant", {
          [key]: value
        });
        return;
      }
      setStore("variant", key, value);
    };
    return {
      ready,
      list,
      find,
      visible,
      setVisibility,
      recent: {
        list: createMemo(() => store.recent),
        push
      },
      variant: {
        get: getVariant,
        set: setVariant
      }
    };
  }
});