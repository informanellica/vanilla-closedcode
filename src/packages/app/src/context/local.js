/** @file Local context: per-directory/per-session agent, model, and model-variant selection with persistence, fallback resolution, and cross-directory handoff. */
import { createSimpleContext } from "@/lib/context.js";
import { base64Encode } from "core/util/encode";
import { useParams } from "../lib/router/index.js";
import { batch, createEffect, createMemo } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { useModels } from "@/context/models.js";
import { useProviders } from "@/hooks/use-providers.js";
import { Persist, persisted } from "@/utils/persist.js";
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "./model-variant.js";
import { useSDK } from "./sdk.js";
import { useSync } from "./sync.js";
const WORKSPACE_KEY = "__workspace__";
const handoff = new Map();
/**
 * Builds the key for the cross-directory handoff map (used when promoting a draft selection into a session in another directory).
 * @param {string} dir - The target directory.
 * @param {string} id - The session id.
 * @returns {string} The handoff map key.
 */
const handoffKey = (dir, id) => `${dir}\n${id}`;
/**
 * Migrates persisted model-selection state to the current shape (`{session}`), dropping the legacy workspace-level pick.
 * @param {*} value - The previously persisted value (any legacy shape).
 * @returns {Object} The normalized `{session}` state.
 */
const migrate = value => {
  if (!value || typeof value !== "object") return {
    session: {}
  };
  const item = value;
  if (item.session && typeof item.session === "object") return {
    session: item.session
  };
  if (!item.pick || typeof item.pick !== "object") return {
    session: {}
  };
  return {
    session: Object.fromEntries(Object.entries(item.pick).filter(([key]) => key !== WORKSPACE_KEY))
  };
};
/**
 * Deep-clones a selection snapshot (agent/model/variant) so the nested `model` object is not shared by reference.
 * @param {Object} value - The selection snapshot to clone (may be falsy).
 * @returns {Object} A shallow clone with a fresh `model`, or undefined when input is falsy.
 */
const clone = value => {
  if (!value) return undefined;
  return {
    ...value,
    model: value.model ? {
      ...value.model
    } : undefined
  };
};
/**
 * Local (per-directory) selection context. Tracks the current agent, model, and model variant for
 * the active directory and session, persisting per-session selections and supporting a draft
 * (no-session) selection plus cross-directory handoff.
 * Exposes: `slug` (base64 of the directory), `model` (current model plus list/recent/cycle/set/
 * visibility and a nested `variant` controller), `agent` (list/current/set/move), and `session`
 * (reset/promote/restore for moving or restoring a selection across sessions).
 */
export const {
  use: useLocal,
  provider: LocalProvider
} = createSimpleContext({
  name: "Local",
  init: () => {
    const params = useParams();
    const sdk = useSDK();
    const sync = useSync();
    const providers = useProviders();
    const models = useModels();
    const id = createMemo(() => params.id || undefined);
    const list = createMemo(() => sync.data?.agent.filter(item => item.mode !== "subagent" && !item.hidden));
    const connected = createMemo(() => new Set(providers.connected().map(item => item.id)));
    const [saved, setSaved] = persisted({
      ...Persist.workspace(sdk.directory, "model-selection", ["model-selection.v1"]),
      migrate
    }, createStore({
      session: {}
    }));
    const [store, setStore] = createStore({
      current: list()[0]?.name,
      draft: undefined,
      last: undefined
    });
    // Whether a {providerID, modelID} refers to a model offered by a currently connected provider.
    /**
     * Whether a model reference is offered by a currently connected provider.
     * @param {Object} model - A {providerID, modelID} reference.
     * @returns {boolean} True when the provider is connected and offers the model.
     */
    const validModel = model => {
      const provider = providers.all().find(item => item.id === model.providerID);
      return !!provider?.models[model.modelID] && connected().has(model.providerID);
    };
    // Returns the first valid model produced by the given accessors, skipping null/invalid ones.
    /**
     * Return the first valid model produced by the given accessors, skipping null/invalid ones.
     * @param {...Function} items - Zero-argument accessors each returning a model reference or falsy.
     * @returns {Object} The first valid model reference, or undefined when none qualify.
     */
    const firstModel = (...items) => {
      for (const item of items) {
        const model = item();
        if (!model) continue;
        if (validModel(model)) return model;
      }
    };
    // Resolve an agent by name, falling back to the first agent (or undefined when none exist).
    /**
     * Resolve an agent by name, falling back to the first agent (or undefined when none exist).
     * @param {string} name - The agent name to look up.
     * @returns {Object} The matching agent, the first agent, or undefined when none exist.
     */
    const pickAgent = name => {
      const items = list();
      if (items.length === 0) return undefined;
      return items.find(item => item.name === name) ?? items[0];
    };
    createEffect(() => {
      const items = list();
      if (items.length === 0) {
        if (store.current !== undefined) setStore("current", undefined);
        return;
      }
      if (items.some(item => item.name === store.current)) return;
      setStore("current", items[0]?.name);
    });
    // The active selection scope: the draft when no session is active, otherwise the session's
    // saved selection (or a pending handoff for this directory/session).
    const scope = createMemo(() => {
      const session = id();
      if (!session) return store.draft;
      return saved.session[session] ?? handoff.get(handoffKey(sdk.directory, session));
    });
    createEffect(() => {
      const session = id();
      if (!session) return;
      const key = handoffKey(sdk.directory, session);
      const next = handoff.get(key);
      if (!next) return;
      if (saved.session[session] !== undefined) {
        handoff.delete(key);
        return;
      }
      setSaved("session", session, clone(next));
      handoff.delete(key);
    });
    // The model named in the directory config, if valid for a connected provider.
    /**
     * The model named in the directory config, if valid for a connected provider.
     * @returns {Object} The configured model reference, or undefined.
     */
    const configuredModel = () => {
      if (!sync.data?.config.model) return;
      const [providerID, modelID] = sync.data?.config.model.split("/");
      const model = {
        providerID,
        modelID
      };
      if (validModel(model)) return model;
    };
    // The most recently used model that is still valid for a connected provider.
    /**
     * The most recently used model that is still valid for a connected provider.
     * @returns {Object} The recent model reference, or undefined.
     */
    const recentModel = () => {
      for (const item of models.recent.list()) {
        if (validModel(item)) return item;
      }
    };
    // A sensible default model: each connected provider's configured default, else its first model.
    /**
     * A sensible default model: each connected provider's configured default, else its first model.
     * @returns {Object} A valid default model reference, or undefined when none can be derived.
     */
    const defaultModel = () => {
      const defaults = providers.default();
      for (const provider of providers.connected()) {
        const configured = defaults[provider.id];
        if (configured) {
          const model = {
            providerID: provider.id,
            modelID: configured
          };
          if (validModel(model)) return model;
        }
        const first = Object.values(provider.models)[0];
        if (!first) continue;
        const model = {
          providerID: provider.id,
          modelID: first.id
        };
        if (validModel(model)) return model;
      }
    };
    // Fallback model when neither the scope nor the agent specifies one (configured, then recent, then default).
    const fallback = createMemo(() => configuredModel() ?? recentModel() ?? defaultModel());
    // Agent selection controller: list of selectable agents plus current/set/move accessors.
    const agent = {
      list,
      /**
       * The currently selected agent (from the active scope, else the store's current name).
       * @returns {Object} The current agent, or undefined when none exist.
       */
      current() {
        return pickAgent(scope()?.agent ?? store.current);
      },
      /**
       * Select an agent by name, recording it as the last selection and persisting it to the session or draft.
       * @param {string} name - The agent name to select.
       * @returns {void}
       */
      set(name) {
        const item = pickAgent(name);
        if (!item) {
          setStore("current", undefined);
          return;
        }
        batch(() => {
          setStore("current", item.name);
          setStore("last", {
            type: "agent",
            agent: item.name,
            model: item.model,
            variant: item.variant ?? null
          });
          const prev = scope();
          const next = {
            agent: item.name,
            model: item.model ?? prev?.model,
            variant: item.variant ?? prev?.variant
          };
          const session = id();
          if (session) {
            setSaved("session", session, next);
            return;
          }
          setStore("draft", next);
        });
      },
      /**
       * Cycle the selected agent by a wrapping offset through the agent list.
       * @param {number} direction - Step to move (1 next, -1 previous); wraps around the ends.
       * @returns {void}
       */
      move(direction) {
        const items = list();
        if (items.length === 0) {
          setStore("current", undefined);
          return;
        }
        let next = items.findIndex(item => item.name === agent.current()?.name) + direction;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        const item = items[next];
        if (!item) return;
        agent.set(item.name);
      }
    };
    // The effective current model: the scope's model, else the agent's model, else the fallback,
    // resolved to a full model record.
    /**
     * The effective current model resolved to a full model record (scope model, else agent model, else fallback).
     * @returns {Object} The resolved model record, or undefined when none applies.
     */
    const current = () => {
      const item = firstModel(() => scope()?.model, () => agent.current()?.model, fallback);
      if (!item) return undefined;
      return models.find(item);
    };
    // The variant that the current agent configures for the current model (if applicable).
    /**
     * The model variant that the current agent configures for the current model (if applicable).
     * @returns {*} The configured variant, or undefined.
     */
    const configured = () => {
      const item = agent.current();
      const model = current();
      if (!item || !model) return undefined;
      return getConfiguredAgentVariant({
        agent: {
          model: item.model,
          variant: item.variant
        },
        model: {
          providerID: model.provider.id,
          modelID: model.id,
          variants: model.variants
        }
      });
    };
    // The variant explicitly selected in the active scope (undefined when unset).
    /**
     * The model variant explicitly selected in the active scope.
     * @returns {*} The selected variant, or undefined when unset.
     */
    const selected = () => scope()?.variant;
    // A plain snapshot of the current selection (agent name, model id pair, variant) for promotion/handoff.
    /**
     * A plain snapshot of the current selection (agent name, {providerID, modelID}, variant) for promotion/handoff.
     * @returns {Object} The selection snapshot.
     */
    const snapshot = () => {
      const model = current();
      return {
        agent: agent.current()?.name,
        model: model ? {
          providerID: model.provider.id,
          modelID: model.id
        } : undefined,
        variant: selected()
      };
    };
    // Merge a partial selection into the active scope, writing to the session (when active) or the draft.
    /**
     * Merge a partial selection into the active scope, persisting to the session (when active) or the draft.
     * @param {Object} next - The partial selection fields to merge (e.g. {model} or {variant}).
     * @returns {void}
     */
    const write = next => {
      const state = {
        ...(scope() ?? {
          agent: agent.current()?.name
        }),
        ...next
      };
      const session = id();
      if (session) {
        setSaved("session", session, state);
        return;
      }
      setStore("draft", state);
    };
    const recent = createMemo(() => models.recent.list().map(models.find).filter(Boolean));
    const model = {
      ready: models.ready,
      current,
      recent,
      list: models.list,
      /**
       * Cycle the current model by a wrapping offset through the recent-models list.
       * @param {number} direction - Step to move (1 next, -1 previous); wraps around the ends.
       * @returns {void}
       */
      cycle(direction) {
        const items = recent();
        const item = current();
        if (!item) return;
        const index = items.findIndex(entry => entry?.provider.id === item.provider.id && entry?.id === item.id);
        if (index === -1) return;
        let next = index + direction;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        const entry = items[next];
        if (!entry) return;
        model.set({
          providerID: entry.provider.id,
          modelID: entry.id
        });
      },
      /**
       * Set the current model, recording it as the last selection, making it visible, and optionally pushing it to recents.
       * @param {Object} item - The model reference {providerID, modelID} to select (falsy clears the model).
       * @param {Object} options - Optional {recent} to push the model into the recent list.
       * @returns {void}
       */
      set(item, options) {
        batch(() => {
          setStore("last", {
            type: "model",
            agent: agent.current()?.name,
            model: item ?? null,
            variant: selected()
          });
          write({
            model: item
          });
          if (!item) return;
          models.setVisibility(item, true);
          if (!options?.recent) return;
          models.recent.push(item);
        });
      },
      /**
       * Whether a model is currently visible in the model list.
       * @param {Object} item - The model reference.
       * @returns {boolean} True when the model is visible.
       */
      visible(item) {
        return models.visible(item);
      },
      /**
       * Set a model's visibility in the model list.
       * @param {Object} item - The model reference.
       * @param {boolean} visible - Whether the model should be visible.
       * @returns {void}
       */
      setVisibility(item, visible) {
        models.setVisibility(item, visible);
      },
      variant: {
        configured,
        selected,
        /**
         * The effective current variant, resolving the selected variant against the configured one and the available list.
         * @returns {*} The resolved variant.
         */
        current() {
          return resolveModelVariant({
            variants: this.list(),
            selected: this.selected(),
            configured: this.configured()
          });
        },
        /**
         * The list of variant names available for the current model.
         * @returns {Array} The variant name keys (empty when the model has none).
         */
        list() {
          const item = current();
          if (!item?.variants) return [];
          return Object.keys(item.variants);
        },
        /**
         * Set the current model variant, recording it as the last selection and persisting it.
         * @param {*} value - The variant to select (falsy clears it).
         * @returns {void}
         */
        set(value) {
          batch(() => {
            const model = current();
            setStore("last", {
              type: "variant",
              agent: agent.current()?.name,
              model: model ? {
                providerID: model.provider.id,
                modelID: model.id
              } : null,
              variant: value ?? null
            });
            write({
              variant: value ?? null
            });
          });
        },
        /**
         * Cycle to the next available model variant.
         * @returns {void}
         */
        cycle() {
          const items = this.list();
          if (items.length === 0) return;
          this.set(cycleModelVariant({
            variants: items,
            selected: this.selected(),
            configured: this.configured()
          }));
        }
      }
    };
    const result = {
      slug: createMemo(() => base64Encode(sdk.directory)),
      model,
      agent,
      session: {
        /**
         * Clear the draft (no-session) selection.
         * @returns {void}
         */
        reset() {
          setStore("draft", undefined);
        },
        /**
         * Promote the current draft selection into a session: saved directly when in the same directory,
         * otherwise queued in the cross-directory handoff map. Clears the draft afterward.
         * @param {string} dir - The target directory.
         * @param {string} session - The target session id.
         * @returns {void}
         */
        promote(dir, session) {
          const next = clone(snapshot());
          if (!next) return;
          if (dir === sdk.directory) {
            setSaved("session", session, next);
            setStore("draft", undefined);
            return;
          }
          handoff.set(handoffKey(dir, session), next);
          setStore("draft", undefined);
        },
        /**
         * Restore a session's selection from a server message when no local selection or handoff exists yet.
         * @param {Object} msg - The message carrying {sessionID, agent, model} (model may include a variant).
         * @returns {void}
         */
        restore(msg) {
          const session = id();
          if (!session) return;
          if (msg.sessionID !== session) return;
          if (saved.session[session] !== undefined) return;
          if (handoff.has(handoffKey(sdk.directory, session))) return;
          setSaved("session", session, {
            agent: msg.agent,
            model: msg.model,
            variant: msg.model?.variant ?? null
          });
        }
      }
    };
    return result;
  }
});