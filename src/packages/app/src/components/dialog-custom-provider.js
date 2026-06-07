import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]"><div class="px-2.5 d-flex gap-4 align-items-center"><div class="fs-6 fw-medium text-body-emphasis"></div></div><form class="px-2.5 pb-6 d-flex flex-column gap-6"><p class="text-body"></p><div class="d-flex flex-column gap-4"></div><div class="d-flex flex-column gap-3"><div class="d-flex align-items-center justify-content-between gap-2"><label class="small fw-medium text-secondary"></label></div></div><div class="d-flex flex-column gap-3"><label class="small fw-medium text-secondary">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex gap-2 align-items-center"><div class=flex-1></div><div class=flex-1>`),
  _tmplPreset = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1"><label class="small fw-medium text-secondary">APIの種類</label><select class="form-select"></select><span class="small text-secondary">種類を選ぶと URL が自動入力されます。あとは URL を自分のサーバーに合わせて変えるだけ。「OpenAI互換（手動）」は手入力です。</span></div>`),
  _tmplPull = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-2 p-2 rounded bg-body-tertiary"><label class="small fw-medium text-secondary">モデルを取得 (pull)</label><div class="d-flex gap-2"><input class="form-control form-control-sm" placeholder="例: llama3.2 / qwen2.5-coder:7b"><button type=button class="btn btn-sm btn-primary flex-shrink-0">取得</button></div><div class="progress" style="height:6px"><div class="progress-bar" style="width:0%"></div></div><span class="small text-secondary"></span></div>`);
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
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { IconButton } from "@/bs/icon-button.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { useMutation } from "@tanstack/solid-query";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import { batch, createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Link } from "@/components/link.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { useProvidersController } from "@/controllers/providers.js";
import { headerRow, modelRow, validateCustomProvider } from "./dialog-custom-provider-form.js";
import { DialogSelectProvider } from "./dialog-select-provider.js";
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
    dialog.show(() => _$createComponent(DialogSelectProvider, {}));
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
  const buildContent = () => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$2.nextSibling,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.nextSibling,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$7.firstChild,
        _el$9 = _el$8.firstChild,
        _el$0 = _el$7.nextSibling,
        _el$1 = _el$0.firstChild;
      _$insert(_el$2, _$createComponent(ProviderIcon, {
        id: "synthetic",
        "class": "size-5 shrink-0 text-secondary"
      }), _el$3);
      _$insert(_el$3, () => language.t("provider.custom.title"));
      _el$4.addEventListener("submit", save);
      _$insert(_el$5, () => language.t("provider.custom.description.prefix"), null);
      _$insert(_el$5, _$createComponent(Link, {
        href: "https://github.com/informanellica/vanilla-closedcode",
        tabIndex: -1,
        get children() {
          return language.t("provider.custom.description.link");
        }
      }), null);
      _$insert(_el$5, () => language.t("provider.custom.description.suffix"), null);
      // API-type picker: a select box. Picking a kind auto-fills the URL/models;
      // "OpenAI互換（手動で入力）" leaves the form for manual entry.
      _$insert(_el$6, (() => {
        var _ps = _tmplPreset();
        var _sel = _ps.firstChild.nextSibling;
        var _blank = document.createElement("option");
        _blank.value = "";
        _blank.textContent = "OpenAI互換（手動で入力）";
        _sel.appendChild(_blank);
        for (const p of LLM_PRESETS) {
          var _o = document.createElement("option");
          _o.value = p.providerID;
          _o.textContent = p.name;
          _sel.appendChild(_o);
        }
        _sel.addEventListener("change", () => {
          const p = LLM_PRESETS.find(x => x.providerID === _sel.value);
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
        return _ps;
      })(), null);
      // providerID field intentionally not rendered — it is derived automatically
      // (see deriveProviderID). The user only picks an API type and a URL.
      _$insert(_el$6, _$createComponent(TextField, {
        autofocus: true,
        label: "プロファイル名",
        placeholder: "例: テスト / 自宅のOllama",
        get value() {
          return form.name;
        },
        onChange: v => setField("name", v),
        get validationState() {
          return form.err.name ? "invalid" : undefined;
        },
        get error() {
          // Required: block save and show a red error when empty.
          return form.err.name ? "必須項目です（プロファイル名を入力してください）" : undefined;
        }
      }), null);
      _$insert(_el$6, _$createComponent(TextField, {
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
        },
        get validationState() {
          return form.err.baseURL ? "invalid" : undefined;
        },
        get error() {
          return form.err.baseURL;
        }
      }), null);
      // Connectivity check: ping the URL (main process → no CORS, works for
      // remote hosts) and pull the installed model list into the list below.
      _$insert(_el$6, _$createComponent(Button, {
        type: "button",
        variant: "secondary",
        "class": "self-start",
        icon: "magnifying-glass",
        onClick: checkAndListModels,
        get disabled() {
          return !form.baseURL.trim() || conn().busy;
        },
        get children() {
          return _$memo(() => !!conn().busy)() ? "確認中…" : "接続を確認してモデルを取得";
        }
      }), null);
      // Model pull (only for providers that support it — e.g. Ollama). Works
      // against the configured host, local or remote.
      _$insert(_el$6, _$createComponent(Show, {
        get when() {
          return canPull();
        },
        get children() {
          var _pl = _tmplPull();
          var _row = _pl.firstChild.nextSibling;
          var _input = _row.firstChild;
          var _btn = _input.nextSibling;
          var _progress = _row.nextSibling;
          var _bar = _progress.firstChild;
          var _status = _progress.nextSibling;
          _input.addEventListener("input", () => setPullName(_input.value));
          _btn.addEventListener("click", pullModelNow);
          createEffect(() => {
            const c = conn();
            _btn.disabled = c.busy || !pullName().trim();
            _progress.style.display = c.percent == null ? "none" : "";
            _bar.style.width = (c.percent ?? 0) + "%";
            _status.textContent = c.status || "";
          });
          return _pl;
        }
      }), null);
      _$insert(_el$6, _$createComponent(TextField, {
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
      }), null);
      _$insert(_el$9, () => language.t("provider.custom.models.label"));
      _$insert(_el$8, _$createComponent(Button, {
        type: "button",
        size: "small",
        variant: "ghost",
        icon: "magnifying-glass",
        onClick: () => discoverMutation.mutate(),
        get disabled() {
          return !form.baseURL.trim() || discoverMutation.isPending;
        },
        get children() {
          return _$memo(() => !!discoverMutation.isPending)() ? language.t("provider.custom.models.discover.loading") : language.t("provider.custom.models.discover.button");
        }
      }), null);
      // Column headers for the model rows (the per-input labels are hidden to
      // keep id / name / actions on one line).
      _$insert(_el$7, (() => {
        var _hdr = document.createElement("div");
        _hdr.className = "d-flex gap-2 align-items-center small fw-medium text-secondary px-1";
        var _h1 = document.createElement("div");
        _h1.className = "flex-1";
        _h1.textContent = "モデルID";
        var _h2 = document.createElement("div");
        _h2.className = "flex-1";
        _h2.textContent = "表示名";
        _hdr.appendChild(_h1);
        _hdr.appendChild(_h2);
        return _hdr;
      })(), null);
      _$insert(_el$7, _$createComponent(For, {
        get each() {
          return form.models;
        },
        children: (m, i) => (() => {
          var _el$10 = _tmpl$2(),
            _el$11 = _el$10.firstChild,
            _el$12 = _el$11.nextSibling;
          _$insert(_el$11, _$createComponent(TextField, {
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
            onChange: v => setModel(i(), "id", v),
            get validationState() {
              return m.err.id ? "invalid" : undefined;
            },
            get error() {
              return m.err.id;
            }
          }));
          _$insert(_el$12, _$createComponent(TextField, {
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
            onChange: v => setModel(i(), "name", v),
            get validationState() {
              return m.err.name ? "invalid" : undefined;
            },
            get error() {
              return m.err.name;
            }
          }));
          // Row action depends on state: ＋ pull a new model, ⟳ overwrite when
          // the id was changed (pull new + rm old), 🗑 delete (rm) / remove row.
          _$insert(_el$10, (() => {
            var _act = document.createElement("div");
            _act.className = "d-flex gap-1 flex-shrink-0 align-items-center";
            _$insert(_act, _$createComponent(Show, {
              get when() {
                return !m.origId;
              },
              get children() {
                return _$createComponent(IconButton, {
                  type: "button",
                  icon: "plus",
                  variant: "ghost",
                  title: "追加（ollama pull）",
                  "aria-label": "追加（ollama pull）",
                  get disabled() {
                    return !m.id.trim() || conn().busy;
                  },
                  onClick: () => void addRow(i())
                });
              }
            }));
            _$insert(_act, _$createComponent(Show, {
              get when() {
                return !!m.origId && (m.id.trim() !== m.origId || (m.name || "").trim() !== m.origName);
              },
              get children() {
                return _$createComponent(IconButton, {
                  type: "button",
                  icon: "arrow-clockwise",
                  variant: "ghost",
                  title: "適用（変更を反映。IDを変えた場合は新IDでpullし直し）",
                  "aria-label": "適用",
                  get disabled() {
                    return !m.id.trim() || conn().busy;
                  },
                  onClick: () => void applyRow(i())
                });
              }
            }));
            _$insert(_act, _$createComponent(IconButton, {
              type: "button",
              icon: "trash",
              variant: "ghost",
              get disabled() {
                return form.models.length <= 1;
              },
              get ["aria-label"]() {
                return language.t("provider.custom.models.remove");
              },
              onClick: () => m.origId ? deleteModel(i()) : removeModel(i())
            }), null);
            return _act;
          })(), null);
          _$effect(() => _$setAttribute(_el$10, "data-row", m.row));
          return _el$10;
        })()
      }), null);
      _$insert(_el$7, _$createComponent(Button, {
        type: "button",
        size: "small",
        variant: "ghost",
        icon: "plus-small",
        onClick: addModel,
        "class": "self-start",
        get children() {
          return language.t("provider.custom.models.add");
        }
      }), null);
      _$insert(_el$1, () => language.t("provider.custom.headers.label"));
      _$insert(_el$0, _$createComponent(For, {
        get each() {
          return form.headers;
        },
        children: (h, i) => (() => {
          var _el$13 = _tmpl$2(),
            _el$14 = _el$13.firstChild,
            _el$15 = _el$14.nextSibling;
          _$insert(_el$14, _$createComponent(TextField, {
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
            onChange: v => setHeader(i(), "key", v),
            get validationState() {
              return h.err.key ? "invalid" : undefined;
            },
            get error() {
              return h.err.key;
            }
          }));
          _$insert(_el$15, _$createComponent(TextField, {
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
            onChange: v => setHeader(i(), "value", v),
            get validationState() {
              return h.err.value ? "invalid" : undefined;
            },
            get error() {
              return h.err.value;
            }
          }));
          _$insert(_el$13, _$createComponent(IconButton, {
            type: "button",
            icon: "trash",
            variant: "ghost",
            "class": "flex-shrink-0",
            onClick: () => removeHeader(i()),
            get disabled() {
              return form.headers.length <= 1;
            },
            get ["aria-label"]() {
              return language.t("provider.custom.headers.remove");
            }
          }), null);
          _$effect(() => _$setAttribute(_el$13, "data-row", h.row));
          return _el$13;
        })()
      }), null);
      _$insert(_el$0, _$createComponent(Button, {
        type: "button",
        size: "small",
        variant: "ghost",
        icon: "plus-small",
        onClick: addHeader,
        "class": "self-start",
        get children() {
          return language.t("provider.custom.headers.add");
        }
      }), null);
      // Fold the optional sections (models / headers) into a collapsible
      // <details> so the essential fields (種類・名前・URL) stay short.
      var _adv = document.createElement("details");
      _adv.className = "d-flex flex-column gap-3";
      var _sum = document.createElement("summary");
      _sum.className = "small fw-medium text-secondary";
      _sum.style.cursor = "pointer";
      _sum.textContent = "詳細設定（モデル・ヘッダー）";
      _adv.appendChild(_sum);
      _adv.appendChild(_el$7);
      _adv.appendChild(_el$0);
      _el$4.appendChild(_adv);
      // Sticky footer pinned to the viewport bottom: キャンセル returns to the
      // provider list, 保存 submits. Always visible without scrolling.
      var _footer = document.createElement("div");
      _footer.className = "position-sticky bottom-0 d-flex justify-content-end gap-2 pt-3 pb-2 mt-2 border-top";
      _footer.style.background = "var(--surface-stronger-non-alpha, var(--bs-body-bg))";
      _footer.style.zIndex = "5";
      _$insert(_footer, _$createComponent(Button, {
        "class": "w-auto",
        type: "button",
        size: "large",
        variant: "secondary",
        onClick: goBack,
        get children() {
          return "キャンセル";
        }
      }), null);
      _$insert(_footer, _$createComponent(Button, {
        "class": "w-auto",
        type: "submit",
        size: "large",
        variant: "primary",
        get disabled() {
          return saveMutation.isPending;
        },
        get children() {
          return _$memo(() => !!saveMutation.isPending)() ? language.t("common.saving") : "保存";
        }
      }), null);
      _el$4.appendChild(_footer);
      return _el$;
  };
  // Inline (settings-panel) mode: render the form with a "back" control instead
  // of a Dialog wrapper, so the デスクトップ/LLM nav stays put (no modal switch).
  if (props.inline) {
    var _wrap = document.createElement("div");
    _wrap.className = "d-flex flex-column gap-2";
    // No top "back" control — it scrolls out of view. Returning to the provider
    // list is done with the キャンセル button in the sticky footer instead.
    // Inline: drop the dialog's own nested scroll so the form flows in the
    // settings panel's scroll — the 保存 button at the bottom stays reachable.
    var _content = buildContent();
    _content.classList.remove("overflow-y-auto");
    _content.classList.remove("max-h-[60vh]");
    _$insert(_wrap, _content, null);
    return _wrap;
  }
  return _$createComponent(Dialog, {
    get title() {
      return _$createComponent(IconButton, {
        tabIndex: -1,
        icon: "arrow-left",
        variant: "ghost",
        onClick: goBack,
        get ["aria-label"]() {
          return language.t("common.goBack");
        }
      });
    },
    transition: true,
    get children() {
      return buildContent();
    }
  });
}