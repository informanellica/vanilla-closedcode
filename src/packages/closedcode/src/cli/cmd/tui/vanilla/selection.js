// In-memory model/agent/variant selection for the vanilla TUI. This is the
// immediate-mode, disk-free replacement for the slices of context/local.js that
// the shell actually uses: the active agent, the active model (providerID +
// modelID), the model's reasoning/effort variant, plus a favorites list.
//
// Design notes vs. the original solid local.js:
//   - No disk persistence. The original kept recent/favorite/variant in
//     model.json; here everything lives in memory for the session (the spec
//     requires "in-memory only").
//   - No per-agent model map. The original keyed the chosen model by agent name;
//     here a single model selection applies to whichever agent is current. This
//     matches the vanilla shell, which had one flat modelSel signal.
//   - Selection holds only the *override*. current() always falls back to live
//     data (first provider's first model / first non-hidden agent) when nothing
//     has been explicitly set, so a fresh selection works before any set().
//
// The data layer's store is injected; every accessor reads it FRESH (store
// accessors call rev() internally), so the shell's whole-screen redraw always
// sees up-to-date provider/agent lists. createSelection itself holds no signals
// — its mutable state is plain fields, and the shell repaints on key events.

// Stable key for a {providerID, modelID} pair (favorites + variant maps).
function modelKey(m) {
  return `${m.providerID}/${m.modelID}`;
}

// The non-subagent, non-hidden agents — the ones a user can pick / cycle.
function visibleAgents(store) {
  return (store.agents() ?? []).filter(a => a.mode !== "subagent" && !a.hidden);
}

// Find a provider by id in the live providers() list.
function findProvider(store, providerID) {
  return (store.providers() ?? []).find(p => p.id === providerID);
}

// Is this {providerID, modelID} a real model in the current provider list?
function isModelValid(store, m) {
  if (!m) return false;
  const provider = findProvider(store, m.providerID);
  return !!(provider && provider.models && provider.models[m.modelID]);
}

// The fallback model: the first provider's first model. Used when nothing has
// been explicitly selected (mirrors local.js's fallbackModel tail).
function firstModel(store) {
  for (const p of store.providers() ?? []) {
    const ids = Object.keys(p.models ?? {});
    if (ids.length) return { providerID: p.id, modelID: ids[0] };
  }
  return undefined;
}

// Flat list of every selectable model across all providers, in provider order.
function allModels(store) {
  const out = [];
  for (const p of store.providers() ?? []) {
    for (const [modelID, info] of Object.entries(p.models ?? {})) {
      out.push({ providerID: p.id, modelID, name: info?.name ?? modelID });
    }
  }
  return out;
}

export function createSelection(opts = {}) {
  const data = opts.data;
  const store = data.store;
  const toast = opts.toast; // optional { show({message,variant}) } for invalid picks

  // Override state (undefined => fall back to live data).
  let agentOverride; // agent name
  let modelOverride; // { providerID, modelID }
  const variants = new Map(); // modelKey -> chosen variant string
  let favorites = []; // [{ providerID, modelID }] in insertion order

  const warn = message => { try { toast?.show?.({ message, variant: "warning" }); } catch { /* ignore */ } };

  // ---- agent --------------------------------------------------------------
  const agent = {
    // The selectable agents (visible, non-subagent).
    list() {
      return visibleAgents(store);
    },
    // Active agent name. Falls back to the first visible agent, then opts.agent.
    current() {
      const list = visibleAgents(store);
      const found = list.find(a => a.name === agentOverride);
      return (found ?? list[0])?.name ?? opts.agent;
    },
    // Select by name; no-op (warns) if the name is not a visible agent.
    set(name) {
      if (!visibleAgents(store).some(a => a.name === name)) { warn(`Agent not found: ${name}`); return; }
      agentOverride = name;
    },
    // Cycle to the next/prev agent, wrapping at both ends. dir defaults to +1.
    cycle(dir = 1) {
      const list = visibleAgents(store);
      if (!list.length) return;
      const cur = this.current();
      let idx = list.findIndex(a => a.name === cur);
      if (idx === -1) idx = 0;
      let next = idx + dir;
      next = ((next % list.length) + list.length) % list.length; // wrap both ways
      agentOverride = list[next].name;
    },
  };

  // ---- model --------------------------------------------------------------
  const model = {
    // Active model {providerID, modelID} or undefined when no providers.
    // Falls back to the first provider's first model when nothing is set.
    current() {
      if (modelOverride && isModelValid(store, modelOverride)) return { ...modelOverride };
      return firstModel(store);
    },
    // Display-friendly { provider, model } names for the meta line.
    parsed() {
      const m = this.current();
      if (!m) return { provider: "Connect a provider", model: "No model selected" };
      const provider = findProvider(store, m.providerID);
      const info = provider?.models?.[m.modelID];
      return { provider: provider?.name ?? m.providerID, model: info?.name ?? m.modelID };
    },
    // Every selectable model across providers: {providerID, modelID, name}[].
    list() {
      return allModels(store);
    },
    // Select a model; no-op (warns) if it is not a valid {providerID, modelID}.
    set(m) {
      if (!isModelValid(store, m)) { warn(`Model ${m?.providerID}/${m?.modelID} is not valid`); return; }
      modelOverride = { providerID: m.providerID, modelID: m.modelID };
    },
    // Cycle through the flat model list, wrapping. dir defaults to +1.
    cycle(dir = 1) {
      const list = allModels(store);
      if (!list.length) return;
      const cur = this.current();
      let idx = cur ? list.findIndex(x => x.providerID === cur.providerID && x.modelID === cur.modelID) : -1;
      if (idx === -1) idx = 0;
      let next = idx + dir;
      next = ((next % list.length) + list.length) % list.length;
      const val = list[next];
      modelOverride = { providerID: val.providerID, modelID: val.modelID };
    },
    favorite: {
      // Toggle a model in/out of the favorites list (validated).
      toggle(m) {
        if (!isModelValid(store, m)) { warn(`Model ${m?.providerID}/${m?.modelID} is not valid`); return; }
        const key = modelKey(m);
        if (favorites.some(f => modelKey(f) === key)) {
          favorites = favorites.filter(f => modelKey(f) !== key);
        } else {
          favorites = [{ providerID: m.providerID, modelID: m.modelID }, ...favorites];
        }
      },
      // Current favorites that are still valid, as {providerID, modelID}[].
      list() {
        return favorites.filter(f => isModelValid(store, f)).map(f => ({ ...f }));
      },
    },
  };

  // ---- variant ------------------------------------------------------------
  // Variants are per-model (keyed by the current model). list() comes straight
  // from the provider's model.variants object.
  const variant = {
    // Variant names available for the current model (provider-declared).
    list() {
      const m = model.current();
      if (!m) return [];
      const info = findProvider(store, m.providerID)?.models?.[m.modelID];
      return info?.variants ? Object.keys(info.variants) : [];
    },
    // Chosen variant for the current model, or undefined. A stored value that is
    // no longer in the model's variant list reads back as undefined.
    current() {
      const m = model.current();
      if (!m) return undefined;
      const v = variants.get(modelKey(m));
      if (!v) return undefined;
      return this.list().includes(v) ? v : undefined;
    },
    // Set the variant for the current model (pass undefined/falsey to clear).
    set(v) {
      const m = model.current();
      if (!m) return;
      const key = modelKey(m);
      if (!v) variants.delete(key);
      else variants.set(key, v);
    },
    // Cycle: undefined -> first -> ... -> last -> undefined. No-op with 0 variants.
    cycle() {
      const list = this.list();
      if (!list.length) return;
      const cur = this.current();
      if (!cur) { this.set(list[0]); return; }
      const idx = list.indexOf(cur);
      if (idx === -1 || idx === list.length - 1) { this.set(undefined); return; }
      this.set(list[idx + 1]);
    },
  };

  return { agent, model, variant };
}
