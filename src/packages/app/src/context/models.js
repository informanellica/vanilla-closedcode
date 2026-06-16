/** @file Models context: aggregates models from connected providers and layers persisted user state (visibility, recent list, variant selection). */
import { createMemo } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { DateTime } from "luxon";
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda";
import { createSimpleContext } from "@/lib/context.js";
import { useProviders } from "@/hooks/use-providers.js";
import { Persist, persisted } from "@/utils/persist.js";
const RECENT_LIMIT = 5;
/**
 * Builds a stable string key identifying a model by provider and model id.
 * @param {Object} model - Has `providerID` and `modelID`.
 * @returns {string} The `<providerID>:<modelID>` key.
 */
function modelKey(model) {
  return `${model.providerID}:${model.modelID}`;
}
/**
 * Models context. Aggregates models from connected providers and layers on persisted user state:
 * per-model visibility, a recent-models list, and per-model variant selection.
 * Exposes: `ready` (persistence loaded), `list` (all available models with normalized names and a
 * `latest` flag), `find(key)` (look up a model by {providerID, modelID}), `visible(model)` /
 * `setVisibility(model, state)`, `recent` ({list, push}), and `variant` ({get, set}).
 */
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
    /**
     * Look up a model in the available list by {providerID, modelID}.
     * @param {Object} key - Has `providerID` and `modelID`.
     * @returns {Object} The matching model, or undefined.
     */
    const find = key => list().find(m => m.id === key.modelID && m.provider.id === key.providerID);
    /**
     * Upserts a model's visibility state into the persisted `user` list.
     * @param {Object} model - Has `providerID` and `modelID`.
     * @param {string} state - The visibility state to store ("show" or "hide").
     */
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
    /**
     * Whether a model should be shown: explicit user state wins, otherwise default to
     * visible for "latest" models and for models without a valid release date.
     * @param {Object} model - Has `providerID` and `modelID`.
     * @returns {boolean} True when the model should be visible.
     */
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
    /**
     * Set a model visible (true) or hidden (false) in the persisted user state.
     * @param {Object} model - Has `providerID` and `modelID`.
     * @param {boolean} state - True to show, false to hide.
     */
    const setVisibility = (model, state) => {
      update(model, state ? "show" : "hide");
    };
    /**
     * Push a model to the front of the recent list, de-duplicating and capping at RECENT_LIMIT.
     * @param {Object} model - Has `providerID` and `modelID`.
     */
    const push = model => {
      const uniq = uniqueBy([model, ...store.recent], x => `${x.providerID}:${x.modelID}`);
      if (uniq.length > RECENT_LIMIT) uniq.pop();
      setStore("recent", uniq);
    };
    /**
     * Storage key for a model's persisted variant selection.
     * @param {Object} model - Has `providerID` and `modelID`.
     * @returns {string} The `<providerID>/<modelID>` storage key.
     */
    const variantKey = model => `${model.providerID}/${model.modelID}`;
    /**
     * Read the persisted variant selection for a model (undefined when unset).
     * @param {Object} model - Has `providerID` and `modelID`.
     * @returns {*} The stored variant value, or undefined.
     */
    const getVariant = model => store.variant?.[variantKey(model)];
    /**
     * Persist the variant selection for a model.
     * @param {Object} model - Has `providerID` and `modelID`.
     * @param {*} value - The variant value to store.
     */
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