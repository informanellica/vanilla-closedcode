import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { IconButton } from "@/bs/icon-button.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { useMutation } from "../lib/query/index.js";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import { batch, createComponent, createEffect, createMemo, createRoot, createSignal, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Link } from "@/components/link.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { useProvidersController } from "@/controllers/providers.js";
import { headerRow, modelRow, validateCustomProvider } from "./dialog-custom-provider-form.js";
import { DialogSelectProvider } from "./dialog-select-provider.js";

// Local-LLM presets (OpenAI-compatible). Inlined to avoid a new import; picking
// one fills providerID / name / baseURL / models so the only thing left to do is
// set the URL to your own server. "OpenAI互換（手動）" leaves the form blank.
const LLM_PRESETS = [{
  providerID: "ollama",
  name: "Ollama",
  icon: "bi-box-seam",
  baseURL: "http://localhost:11434/v1",
  models: [{ id: "llama3.2", name: "Llama 3.2" }, { id: "qwen2.5-coder", name: "Qwen2.5 Coder" }]
}, {
  providerID: "lmstudio",
  name: "LM Studio",
  icon: "bi-pc-display",
  baseURL: "http://localhost:1234/v1",
  models: [{ id: "local-model", name: "Local Model" }]
}, {
  providerID: "llamacpp",
  name: "llama.cpp",
  icon: "bi-terminal",
  baseURL: "http://localhost:8080/v1",
  models: [{ id: "local-model", name: "Local Model" }]
}, {
  providerID: "vllm",
  name: "vLLM",
  icon: "bi-cpu",
  baseURL: "http://localhost:8000/v1",
  models: [{ id: "local-model", name: "Local Model" }]
}, {
  providerID: "jan",
  name: "Jan",
  icon: "bi-chat-dots",
  baseURL: "http://localhost:1337/v1",
  models: [{ id: "local-model", name: "Local Model" }]
}];

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// For-equivalent keyed list rendering. Rows are keyed by store-item identity:
// each row gets its own root so row-level effects/components survive sibling
// add/remove and are disposed exactly when their row leaves the list. The
// effect tracks the array shape (length + element identity) only — editing a
// row's fields never recreates its DOM (typing keeps focus, like <For>).
function renderKeyedList(slot, readRows, build) {
  const cache = new Map();
  createEffect(() => {
    const rows = readRows().map(r => r);
    const live = new Set(rows);
    // Drop departed rows first so surviving nodes keep their DOM positions
    // (mirrors <For>, which removes just the leaving node).
    for (const [item, entry] of cache) {
      if (live.has(item)) continue;
      entry.dispose();
      entry.node.remove();
      cache.delete(item);
    }
    rows.forEach((item, index) => {
      let entry = cache.get(item);
      if (!entry) {
        entry = createRoot(dispose => ({ node: build(item), dispose }));
        cache.set(item, entry);
      }
      if (slot.children[index] !== entry.node) slot.insertBefore(entry.node, slot.children[index] ?? null);
    });
  });
  onCleanup(() => {
    for (const entry of cache.values()) entry.dispose();
  });
}

export function DialogCustomProvider(props) {
  const dialog = useDialog();
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const controller = useProvidersController();
  const [form, setForm] = createStore(props.initial ?? {
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [modelRow()],
    headers: [headerRow()],
    err: {}
  });
  // When rendered inline (in the settings panel) we don't switch dialogs — we
  // call back to the host to dismiss the form / report completion.
  const goBack = () => {
    if (props.inline) {
      props.onClose?.();
      return;
    }
    if (props.back === "close") {
      dialog.close();
      return;
    }
    dialog.show(() => createComponent(DialogSelectProvider, {}));
  };
  const finish = result => {
    if (props.inline) {
      props.onDone?.(result);
      return;
    }
    dialog.close();
  };
  const addModel = () => {
    setForm("models", produce(rows => {
      rows.push(modelRow());
    }));
  };
  const removeModel = index => {
    if (form.models.length <= 1) return;
    setForm("models", produce(rows => {
      rows.splice(index, 1);
    }));
  };
  // Trash on a model row: confirm via a toast (削除する / キャンセル), then delete
  // from the Ollama server (ollama rm) and drop the row. Empty rows just drop.
  const deleteModel = index => {
    const id = (form.models[index]?.id || "").trim();
    if (!id) {
      removeModel(index);
      return;
    }
    const doDelete = () => {
      const api = typeof window !== "undefined" ? window.api : null;
      const url = form.baseURL.trim();
      if (api?.llmDeleteModel && url) {
        api.llmDeleteModel(url, id).then(() => showToast({ variant: "success", icon: "circle-check", title: "モデルを削除しました", description: `「${id}」をサーバーから削除しました。` })).catch(e => showToast({ title: "削除に失敗しました", description: String(e?.message ?? e) }));
      }
      removeModel(index);
    };
    showToast({
      variant: "warning",
      title: "モデルを削除しますか？",
      description: `「${id}」を Ollama サーバーから削除します（ollama rm）。元に戻せません。`,
      persistent: true,
      actions: [{ label: "削除する", variant: "danger", onClick: doDelete }, { label: "キャンセル", variant: "secondary", onClick: () => {} }]
    });
  };
  const addHeader = () => {
    setForm("headers", produce(rows => {
      rows.push(headerRow());
    }));
  };
  const removeHeader = index => {
    if (form.headers.length <= 1) return;
    setForm("headers", produce(rows => {
      rows.splice(index, 1);
    }));
  };
  const setField = (key, value) => {
    setForm(key, value);
    if (key === "apiKey") return;
    setForm("err", key, undefined);
  };
  // providerID is an internal key (namespaces models as "id/model" and must be
  // unique). The user shouldn't have to type it, so it's hidden and derived from
  // the chosen API type or the URL host, made unique against existing providers.
  let presetRoot = "";
  const sanitizeId = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const hostFrom = url => {
    try {
      return new URL(/^https?:\/\//.test(url) ? url : "http://" + url).host;
    } catch {
      return "";
    }
  };
  const uniqueProviderID = base => {
    const existing = new Set((globalSync.data.provider.all ?? []).map(p => p.id));
    const root = base && /^[a-z0-9]/.test(base) ? base : "provider";
    if (!existing.has(root)) return root;
    let n = 2, id;
    do {
      id = root + "-" + n++;
    } while (existing.has(id));
    return id;
  };
  const deriveProviderID = () => setField("providerID", uniqueProviderID(presetRoot || sanitizeId(hostFrom(form.baseURL))));
  // --- LLM model management (list installed / pull), provider-agnostic via the
  // main-process registry. Works for local and remote hosts. ---
  // When editing an existing provider, infer its kind from the providerID root
  // (e.g. "ollama-2" → "ollama") so capability-gated UI (model pull) shows.
  const initialKind = (() => {
    const root = (props.initial?.providerID || "").replace(/-\d+$/, "");
    return LLM_PRESETS.find(p => p.providerID === root)?.providerID || "openai-compatible";
  })();
  const [providerKind, setProviderKind] = createSignal(initialKind);
  const [canPull, setCanPull] = createSignal(false);
  const [pullName, setPullName] = createSignal("");
  const [conn, setConn] = createSignal({ busy: false, status: "", percent: null });
  const llmApi = () => (typeof window !== "undefined" ? window.api : null);
  createEffect(() => {
    const k = providerKind();
    const api = llmApi();
    if (!api?.llmCanPull) {
      setCanPull(false);
      return;
    }
    api.llmCanPull(k).then(v => setCanPull(!!v)).catch(() => setCanPull(false));
  });
  // "接続を確認してモデルを取得": ping the server and pull the installed list.
  const checkAndListModels = async () => {
    const api = llmApi();
    const url = form.baseURL.trim();
    if (!api?.llmListModels || !url) return;
    setConn({ busy: true, status: "接続を確認中…", percent: null });
    try {
      const models = await api.llmListModels(providerKind(), url);
      if (models.length) setForm("models", models.map(m => ({ ...modelRow(), id: m.id, name: m.name || m.id, origId: m.id, origName: m.name || m.id })));
      setConn({ busy: false, status: `接続OK — ${models.length} 個のモデル`, percent: null });
    } catch (e) {
      setConn({ busy: false, status: "接続失敗: " + (e?.message ?? e), percent: null });
    }
  };
  // Pull a model (ollama pull) with shared progress in `conn`. Returns success.
  const pullModel = async modelName => {
    const api = llmApi();
    const url = form.baseURL.trim();
    const model = (modelName || "").trim();
    if (!api?.llmPullModel || !url || !model || conn().busy) return false;
    const requestId = "pull-" + Date.now();
    setConn({ busy: true, status: `「${model}」取得開始…`, percent: 0 });
    const off = api.onLlmPullProgress(p => {
      if (p.requestId !== requestId) return;
      const percent = p.total && p.completed ? Math.round(p.completed / p.total * 100) : conn().percent;
      setConn({ busy: true, status: p.status || "取得中…", percent });
    });
    try {
      await api.llmPullModel(providerKind(), url, model, requestId);
      const done = `「${model}」を取得しました`;
      setConn({ busy: false, status: done, percent: 100 });
      // Auto-clear the success line after a few seconds.
      setTimeout(() => setConn(c => c.status === done && !c.busy ? { busy: false, status: "", percent: null } : c), 5000);
      return true;
    } catch (e) {
      setConn({ busy: false, status: "取得失敗: " + (e?.message ?? e), percent: null });
      return false;
    } finally {
      off?.();
    }
  };
  const pullModelNow = async () => {
    if (await pullModel(pullName())) void checkAndListModels();
  };
  // Row "＋": pull a brand-new model, then mark the row as synced on success.
  const addRow = async index => {
    const id = (form.models[index]?.id || "").trim();
    if (!id) return;
    if (await pullModel(id)) {
      batch(() => {
        if (!(form.models[index].name || "").trim()) setForm("models", index, "name", id);
        const name = (form.models[index].name || "").trim() || id;
        setForm("models", index, "origId", id);
        setForm("models", index, "origName", name);
      });
    }
  };
  // Row "⟳": apply edits. Id changed → pull the new id and rm the old one; a
  // name-only change just updates the config. Marks the row as synced.
  const applyRow = async index => {
    const m = form.models[index];
    const newId = (m?.id || "").trim();
    const newName = (m?.name || "").trim();
    const oldId = m?.origId;
    if (!newId) return;
    if (newId !== oldId) {
      if (!(await pullModel(newId))) return;
      const api = llmApi();
      const url = form.baseURL.trim();
      if (api?.llmDeleteModel && url && oldId) api.llmDeleteModel(url, oldId).catch(() => {});
    }
    batch(() => {
      setForm("models", index, "origId", newId);
      setForm("models", index, "origName", newName);
    });
    showToast({
      variant: "success",
      icon: "circle-check",
      title: "適用しました",
      description: newId !== oldId ? `「${oldId}」→「${newId}」` : `「${newId}」`
    });
  };
  const setModel = (index, key, value) => {
    batch(() => {
      setForm("models", index, key, value);
      setForm("models", index, "err", key, undefined);
    });
  };
  const setHeader = (index, key, value) => {
    batch(() => {
      setForm("headers", index, key, value);
      setForm("headers", index, "err", key, undefined);
    });
  };
  // The vanilla TextField reads its props once at creation, so mirror the live
  // parts externally (same approach as dialog-connect-provider.js): programmatic
  // store writes (presets, auto-fill) flow back into the input, and validation
  // errors set after creation toggle the invalid markup.
  const liveTextField = (options, live = {}) => {
    const field = createComponent(TextField, options);
    const input = field.querySelector("input");
    if (live.value) createEffect(() => {
      const value = live.value() ?? "";
      if (input.value !== value) input.value = value;
    });
    if (live.error) {
      const errorEl = document.createElement("div");
      errorEl.className = "text-danger small mt-1";
      createEffect(() => {
        const error = live.error();
        input.classList.toggle("is-invalid", !!error);
        if (!error) {
          errorEl.remove();
          return;
        }
        errorEl.textContent = error;
        if (!errorEl.parentNode) field.appendChild(errorEl);
      });
    }
    return field;
  };
  const validate = () => {
    const output = validateCustomProvider({
      form,
      t: language.t,
      disabledProviders: globalSync.data.config.disabled_providers ?? [],
      existingProviderIDs: new Set(globalSync.data.provider.all.map(p => p.id))
    });
    batch(() => {
      setForm("err", output.err);
      output.models.forEach((err, index) => setForm("models", index, "err", err));
      output.headers.forEach((err, index) => setForm("headers", index, "err", err));
    });
    return output.result;
  };
  const discoverMutation = useMutation(() => ({
    mutationFn: () => controller.discover({
      baseURL: form.baseURL,
      headers: form.headers.map(h => ({
        key: h.key,
        value: h.value
      })),
      apiKey: form.apiKey
    }),
    onSuccess: ids => {
      // Only replace the model rows when discovery actually returned models. An
      // empty result would otherwise wipe the preset/user models, and the backend
      // then drops the whole provider (so a just-added Ollama would vanish).
      if (ids.length) setForm("models", ids.map(id => ({
        ...modelRow(),
        id,
        name: id
      })));
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.custom.models.discover.success.title"),
        description: language.t("provider.custom.models.discover.success.description", {
          count: ids.length
        })
      });
    },
    onError: err => {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        title: language.t("provider.custom.models.discover.error"),
        description: message
      });
    }
  }));
  const saveMutation = useMutation(() => ({
    mutationFn: result => controller.saveCustom(result),
    onSuccess: result => {
      finish(result);
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", {
          provider: result.name
        }),
        description: language.t("provider.connect.toast.connected.description", {
          provider: result.name
        })
      });
    },
    onError: err => {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        title: language.t("common.requestFailed"),
        description: message
      });
    }
  }));
  const save = e => {
    e.preventDefault();
    if (saveMutation.isPending) return;
    const result = validate();
    if (!result) return;
    saveMutation.mutate(result);
  };
  // API-type picker: a select box. Picking a kind auto-fills the URL/models;
  // "OpenAI互換（手動で入力）" leaves the form for manual entry.
  const buildPresetPicker = () => {
    const block = template(`
      <div class="d-flex flex-column gap-1">
        <label class="small fw-medium text-secondary">APIの種類</label>
        <select class="form-select" data-slot="kind"></select>
        <span class="small text-secondary">種類を選ぶと URL が自動入力されます。あとは URL を自分のサーバーに合わせて変えるだけ。「OpenAI互換（手動）」は手入力です。</span>
      </div>`);
    const select = block.querySelector('[data-slot="kind"]');
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "OpenAI互換（手動で入力）";
    select.appendChild(blank);
    for (const p of LLM_PRESETS) {
      const option = document.createElement("option");
      option.value = p.providerID;
      option.textContent = p.name;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const p = LLM_PRESETS.find(x => x.providerID === select.value);
      setProviderKind(p ? p.providerID : "openai-compatible");
      batch(() => {
        if (p) {
          presetRoot = p.providerID;
          // Do NOT auto-fill the display name from the preset — the name is the
          // user's own profile label (e.g. "テスト"); the preset shows as a tag.
          setField("baseURL", p.baseURL);
          setForm("models", p.models.map(m => ({
            ...modelRow(),
            id: m.id,
            name: m.name
          })));
        } else {
          presetRoot = "";
        }
        deriveProviderID();
      });
    });
    return block;
  };
  // Model pull box (only for providers that support it — e.g. Ollama). Works
  // against the configured host, local or remote. Built fresh on every
  // canPull() false→true flip, matching the original Show remount behavior.
  const buildPullBlock = () => {
    const block = template(`
      <div class="d-flex flex-column gap-2 p-2 rounded bg-body-tertiary">
        <label class="small fw-medium text-secondary">モデルを取得 (pull)</label>
        <div class="d-flex gap-2">
          <input class="form-control form-control-sm" placeholder="例: llama3.2 / qwen2.5-coder:7b" data-slot="pull-input">
          <button type="button" class="btn btn-sm btn-primary flex-shrink-0" data-slot="pull-button">取得</button>
        </div>
        <div class="progress" style="height:6px"><div class="progress-bar" style="width:0%" data-slot="pull-bar"></div></div>
        <span class="small text-secondary" data-slot="pull-status"></span>
      </div>`);
    const input = block.querySelector('[data-slot="pull-input"]');
    const btn = block.querySelector('[data-slot="pull-button"]');
    const bar = block.querySelector('[data-slot="pull-bar"]');
    const progress = bar.parentElement;
    const status = block.querySelector('[data-slot="pull-status"]');
    input.addEventListener("input", () => setPullName(input.value));
    btn.addEventListener("click", pullModelNow);
    createEffect(() => {
      const c = conn();
      btn.disabled = c.busy || !pullName().trim();
      progress.style.display = c.percent == null ? "none" : "";
      bar.style.width = (c.percent ?? 0) + "%";
      status.textContent = c.status || "";
    });
    return block;
  };
  // One model row: id / name fields plus state-dependent actions (＋ pull a new
  // model, ⟳ apply edits when id/name changed, 🗑 delete (rm) / remove row).
  const buildModelRow = m => {
    // Live index: rows shift on add/remove, so resolve at event time.
    const idx = () => form.models.indexOf(m);
    const row = template(`
      <div class="d-flex gap-2 align-items-center">
        <div class="flex-1" data-slot="id"></div>
        <div class="flex-1" data-slot="name"></div>
        <div class="d-flex gap-1 flex-shrink-0 align-items-center" data-slot="actions"></div>
      </div>`);
    // m.row is assigned once at row creation and never changes.
    row.setAttribute("data-row", m.row);
    row.querySelector('[data-slot="id"]').appendChild(liveTextField({
      get label() {
        return language.t("provider.custom.models.id.label");
      },
      hideLabel: true,
      get placeholder() {
        return language.t("provider.custom.models.id.placeholder");
      },
      get value() {
        return m.id;
      },
      onChange: v => setModel(idx(), "id", v)
    }, {
      value: () => m.id,
      error: () => m.err.id
    }));
    row.querySelector('[data-slot="name"]').appendChild(liveTextField({
      get label() {
        return language.t("provider.custom.models.name.label");
      },
      hideLabel: true,
      get placeholder() {
        return language.t("provider.custom.models.name.placeholder");
      },
      get value() {
        return m.name;
      },
      // Row "+" auto-fills the name from the id, so keep the input in sync.
      onChange: v => setModel(idx(), "name", v)
    }, {
      value: () => m.name,
      error: () => m.err.name
    }));
    const actions = row.querySelector('[data-slot="actions"]');
    const addSlot = template(`<div style="display: contents"></div>`);
    const applySlot = template(`<div style="display: contents"></div>`);
    actions.appendChild(addSlot);
    actions.appendChild(applySlot);
    // Show-equivalents: the memos pin the rebuild to truthiness flips so the
    // buttons remount exactly when the original Show did (not on every edit).
    const showAdd = createMemo(() => !m.origId);
    const showApply = createMemo(() => !!m.origId && (m.id.trim() !== m.origId || (m.name || "").trim() !== m.origName));
    createEffect(() => {
      if (!showAdd()) {
        addSlot.replaceChildren();
        return;
      }
      addSlot.replaceChildren(createComponent(IconButton, {
        type: "button",
        icon: "plus",
        variant: "ghost",
        title: "追加（ollama pull）",
        "aria-label": "追加（ollama pull）",
        get disabled() {
          return !m.id.trim() || conn().busy;
        },
        onClick: () => void addRow(idx())
      }));
    });
    createEffect(() => {
      if (!showApply()) {
        applySlot.replaceChildren();
        return;
      }
      applySlot.replaceChildren(createComponent(IconButton, {
        type: "button",
        icon: "arrow-clockwise",
        variant: "ghost",
        title: "適用（変更を反映。IDを変えた場合は新IDでpullし直し）",
        "aria-label": "適用",
        get disabled() {
          return !m.id.trim() || conn().busy;
        },
        onClick: () => void applyRow(idx())
      }));
    });
    actions.appendChild(createComponent(IconButton, {
      type: "button",
      icon: "trash",
      variant: "ghost",
      get disabled() {
        return form.models.length <= 1;
      },
      get ["aria-label"]() {
        return language.t("provider.custom.models.remove");
      },
      onClick: () => m.origId ? deleteModel(idx()) : removeModel(idx())
    }));
    return row;
  };
  // One header row: key / value fields plus a remove button.
  const buildHeaderRowEl = h => {
    const idx = () => form.headers.indexOf(h);
    const row = template(`
      <div class="d-flex gap-2 align-items-center">
        <div class="flex-1" data-slot="key"></div>
        <div class="flex-1" data-slot="value"></div>
      </div>`);
    // h.row is assigned once at row creation and never changes.
    row.setAttribute("data-row", h.row);
    row.querySelector('[data-slot="key"]').appendChild(liveTextField({
      get label() {
        return language.t("provider.custom.headers.key.label");
      },
      hideLabel: true,
      get placeholder() {
        return language.t("provider.custom.headers.key.placeholder");
      },
      get value() {
        return h.key;
      },
      onChange: v => setHeader(idx(), "key", v)
    }, {
      value: () => h.key,
      error: () => h.err.key
    }));
    row.querySelector('[data-slot="value"]').appendChild(liveTextField({
      get label() {
        return language.t("provider.custom.headers.value.label");
      },
      hideLabel: true,
      get placeholder() {
        return language.t("provider.custom.headers.value.placeholder");
      },
      get value() {
        return h.value;
      },
      onChange: v => setHeader(idx(), "value", v)
    }, {
      value: () => h.value,
      error: () => h.err.value
    }));
    row.appendChild(createComponent(IconButton, {
      type: "button",
      icon: "trash",
      variant: "ghost",
      class: "flex-shrink-0",
      onClick: () => removeHeader(idx()),
      get disabled() {
        return form.headers.length <= 1;
      },
      get ["aria-label"]() {
        return language.t("provider.custom.headers.remove");
      }
    }));
    return row;
  };
  const buildContent = () => {
    // Static skeleton. The optional sections (models / headers) live inside a
    // collapsible <details> so the essential fields (種類・名前・URL) stay short;
    // the column-header line keeps id / name / actions on one line (the
    // per-input labels are hidden). The footer is sticky and pinned to the
    // viewport bottom: キャンセル returns to the provider list, 保存 submits.
    const root = template(`
      <div class="d-flex flex-column gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 d-flex gap-4 align-items-center" data-slot="header">
          <div class="fs-6 fw-medium text-body-emphasis" data-slot="title"></div>
        </div>
        <form class="px-2.5 pb-6 d-flex flex-column gap-6" data-slot="form">
          <p class="text-body" data-slot="description"></p>
          <div class="d-flex flex-column gap-4" data-slot="fields"></div>
          <details class="d-flex flex-column gap-3">
            <summary class="small fw-medium text-secondary" style="cursor: pointer">詳細設定（モデル・ヘッダー）</summary>
            <div class="d-flex flex-column gap-3" data-slot="models-section">
              <div class="d-flex align-items-center justify-content-between gap-2" data-slot="models-head">
                <label class="small fw-medium text-secondary" data-slot="models-label"></label>
              </div>
              <div class="d-flex gap-2 align-items-center small fw-medium text-secondary px-1">
                <div class="flex-1">モデルID</div>
                <div class="flex-1">表示名</div>
              </div>
              <div style="display: contents" data-slot="model-rows"></div>
            </div>
            <div class="d-flex flex-column gap-3" data-slot="headers-section">
              <label class="small fw-medium text-secondary" data-slot="headers-label"></label>
              <div style="display: contents" data-slot="header-rows"></div>
            </div>
          </details>
          <div class="position-sticky bottom-0 d-flex justify-content-end gap-2 pt-3 pb-2 mt-2 border-top" style="background: var(--surface-stronger-non-alpha, var(--bs-body-bg)); z-index: 5" data-slot="footer"></div>
        </form>
      </div>`);
    const headerEl = root.querySelector('[data-slot="header"]');
    const titleEl = root.querySelector('[data-slot="title"]');
    const formEl = root.querySelector('[data-slot="form"]');
    const descriptionEl = root.querySelector('[data-slot="description"]');
    const fieldsEl = root.querySelector('[data-slot="fields"]');
    const modelsSection = root.querySelector('[data-slot="models-section"]');
    const modelsHead = root.querySelector('[data-slot="models-head"]');
    const modelsLabel = root.querySelector('[data-slot="models-label"]');
    const modelRowsSlot = root.querySelector('[data-slot="model-rows"]');
    const headersSection = root.querySelector('[data-slot="headers-section"]');
    const headersLabel = root.querySelector('[data-slot="headers-label"]');
    const headerRowsSlot = root.querySelector('[data-slot="header-rows"]');
    const footerEl = root.querySelector('[data-slot="footer"]');

    headerEl.insertBefore(createComponent(ProviderIcon, {
      id: "synthetic",
      class: "size-5 shrink-0 text-secondary"
    }), titleEl);
    createEffect(() => {
      titleEl.textContent = language.t("provider.custom.title");
    });
    formEl.addEventListener("submit", save);

    // Description: reactive prefix / suffix text around the docs link.
    const descriptionPrefix = document.createTextNode("");
    const descriptionSuffix = document.createTextNode("");
    descriptionEl.appendChild(descriptionPrefix);
    descriptionEl.appendChild(createComponent(Link, {
      href: "https://github.com/informanellica/vanilla-closedcode",
      tabIndex: -1,
      get children() {
        return language.t("provider.custom.description.link");
      }
    }));
    descriptionEl.appendChild(descriptionSuffix);
    createEffect(() => {
      descriptionPrefix.data = language.t("provider.custom.description.prefix");
    });
    createEffect(() => {
      descriptionSuffix.data = language.t("provider.custom.description.suffix");
    });

    fieldsEl.appendChild(buildPresetPicker());
    // providerID field intentionally not rendered — it is derived automatically
    // (see deriveProviderID). The user only picks an API type and a URL.
    fieldsEl.appendChild(liveTextField({
      autofocus: true,
      label: "プロファイル名",
      placeholder: "例: テスト / 自宅のOllama",
      get value() {
        return form.name;
      },
      onChange: v => setField("name", v)
    }, {
      // The URL field auto-fills the name from the host, so keep it in sync.
      value: () => form.name,
      // Required: block save and show a red error when empty.
      error: () => form.err.name ? "必須項目です（プロファイル名を入力してください）" : undefined
    }));
    fieldsEl.appendChild(liveTextField({
      get label() {
        return language.t("provider.custom.field.baseURL.label");
      },
      get placeholder() {
        return language.t("provider.custom.field.baseURL.placeholder");
      },
      get value() {
        return form.baseURL;
      },
      onChange: v => {
        setField("baseURL", v);
        deriveProviderID();
        if (!form.name.trim()) setField("name", hostFrom(v));
      }
    }, {
      // The preset picker auto-fills the URL, so keep the input in sync.
      value: () => form.baseURL,
      error: () => form.err.baseURL
    }));
    // Connectivity check: ping the URL (main process → no CORS, works for
    // remote hosts) and pull the installed model list into the list below.
    // The vanilla Button renders its children once — pass a text node kept
    // live by an effect so the label flips while checking.
    const checkLabel = document.createTextNode("");
    createEffect(() => {
      checkLabel.data = conn().busy ? "確認中…" : "接続を確認してモデルを取得";
    });
    fieldsEl.appendChild(createComponent(Button, {
      type: "button",
      variant: "secondary",
      class: "self-start",
      icon: "magnifying-glass",
      onClick: checkAndListModels,
      get disabled() {
        return !form.baseURL.trim() || conn().busy;
      },
      children: checkLabel
    }));
    // Show-equivalent slot for the pull box: rebuilt on each canPull() flip so
    // the box remounts exactly like the original Show.
    const pullSlot = template(`<div style="display: contents"></div>`);
    fieldsEl.appendChild(pullSlot);
    createEffect(() => {
      if (canPull()) pullSlot.replaceChildren(buildPullBlock());
      else pullSlot.replaceChildren();
    });
    fieldsEl.appendChild(createComponent(TextField, {
      get label() {
        return language.t("provider.custom.field.apiKey.label");
      },
      get placeholder() {
        return language.t("provider.custom.field.apiKey.placeholder");
      },
      get description() {
        return language.t("provider.custom.field.apiKey.description");
      },
      get value() {
        return form.apiKey;
      },
      onChange: v => setField("apiKey", v)
    }));

    createEffect(() => {
      modelsLabel.textContent = language.t("provider.custom.models.label");
    });
    // Live Button labels (vanilla Button renders children once): pending state
    // and locale switches must keep updating the text nodes.
    const discoverLabel = document.createTextNode("");
    createEffect(() => {
      discoverLabel.data = discoverMutation.isPending ? language.t("provider.custom.models.discover.loading") : language.t("provider.custom.models.discover.button");
    });
    modelsHead.appendChild(createComponent(Button, {
      type: "button",
      size: "small",
      variant: "ghost",
      icon: "magnifying-glass",
      onClick: () => discoverMutation.mutate(),
      get disabled() {
        return !form.baseURL.trim() || discoverMutation.isPending;
      },
      children: discoverLabel
    }));
    renderKeyedList(modelRowsSlot, () => form.models, buildModelRow);
    const addModelLabel = document.createTextNode("");
    createEffect(() => {
      addModelLabel.data = language.t("provider.custom.models.add");
    });
    modelsSection.appendChild(createComponent(Button, {
      type: "button",
      size: "small",
      variant: "ghost",
      icon: "plus-small",
      onClick: addModel,
      class: "self-start",
      children: addModelLabel
    }));

    createEffect(() => {
      headersLabel.textContent = language.t("provider.custom.headers.label");
    });
    renderKeyedList(headerRowsSlot, () => form.headers, buildHeaderRowEl);
    const addHeaderLabel = document.createTextNode("");
    createEffect(() => {
      addHeaderLabel.data = language.t("provider.custom.headers.add");
    });
    headersSection.appendChild(createComponent(Button, {
      type: "button",
      size: "small",
      variant: "ghost",
      icon: "plus-small",
      onClick: addHeader,
      class: "self-start",
      children: addHeaderLabel
    }));

    footerEl.appendChild(createComponent(Button, {
      class: "w-auto",
      type: "button",
      size: "large",
      variant: "secondary",
      onClick: goBack,
      get children() {
        return "キャンセル";
      }
    }));
    const saveLabel = document.createTextNode("");
    createEffect(() => {
      saveLabel.data = saveMutation.isPending ? language.t("common.saving") : "保存";
    });
    footerEl.appendChild(createComponent(Button, {
      class: "w-auto",
      type: "submit",
      size: "large",
      variant: "primary",
      get disabled() {
        return saveMutation.isPending;
      },
      children: saveLabel
    }));
    return root;
  };
  // Inline (settings-panel) mode: render the form with a "back" control instead
  // of a Dialog wrapper, so the デスクトップ/LLM nav stays put (no modal switch).
  if (props.inline) {
    const wrap = document.createElement("div");
    wrap.className = "d-flex flex-column gap-2";
    // No top "back" control — it scrolls out of view. Returning to the provider
    // list is done with the キャンセル button in the sticky footer instead.
    // Inline: drop the dialog's own nested scroll so the form flows in the
    // settings panel's scroll — the 保存 button at the bottom stays reachable.
    const content = buildContent();
    content.classList.remove("overflow-y-auto");
    content.classList.remove("max-h-[60vh]");
    wrap.appendChild(content);
    return wrap;
  }
  // The vanilla Dialog renders `title` via textContent (strings only) — a Node
  // title would be stringified to "[object HTMLButtonElement]". Pass a truthy
  // placeholder so the header (with its close button) mounts, then swap the
  // back IconButton into the title slot.
  const dialogEl = createComponent(Dialog, {
    title: " ",
    transition: true,
    get children() {
      return buildContent();
    }
  });
  dialogEl.querySelector('[data-slot="dialog-title"]').replaceChildren(createComponent(IconButton, {
    tabIndex: -1,
    icon: "arrow-left",
    variant: "ghost",
    onClick: goBack,
    get ["aria-label"]() {
      return language.t("common.goBack");
    }
  }));
  return dialogEl;
}
