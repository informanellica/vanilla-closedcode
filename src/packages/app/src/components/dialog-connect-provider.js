import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { List } from "@/bs/list.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Spinner } from "@/bs/spinner.js";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import { createComponent, createEffect, createMemo, createRenderEffect, createResource, getOwner, onCleanup, onMount, runWithOwner } from "../lib/reactivity.js";
import { createStore, produce } from "../lib/store.js";
import { Link } from "@/components/link.js";
import { useLanguage } from "@/context/language.js";
import { useProviders } from "@/hooks/use-providers.js";
import { useProvidersController } from "@/controllers/providers.js";

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Row used by the method/option lists: a small "key" pictogram, a label and an
// optional hint span. Templates are single-line to avoid whitespace text nodes.
function listRow(withHint) {
  const row = template(`<div class="w-100 d-flex align-items-center gap-x-2"><div class="w-4 h-2 rounded-[1px] bg-input-base shadow-xs-border-base d-flex align-items-center justify-content-center"><div class="w-2.5 h-0.5 ml-0 bg-icon-strong-base d-none" data-slot="list-item-extra-icon"></div></div><span data-slot="label"></span></div>`);
  if (withHint) {
    const hint = document.createElement("span");
    hint.className = "fw-normal text-secondary";
    hint.dataset.slot = "hint";
    row.appendChild(hint);
  }
  return row;
}

export function DialogConnectProvider(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const providers = useProviders();
  const controller = useProvidersController();
  const all = () => {
    void import("./dialog-select-provider.js").then(x => {
      dialog.show(() => createComponent(x.DialogSelectProvider, {}));
    });
  };
  const alive = {
    value: true
  };
  const timer = {
    current: undefined
  };
  onCleanup(() => {
    alive.value = false;
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  });
  const provider = createMemo(() => controller.findProvider(props.provider, providers.all()));
  const fallback = createMemo(() => [{
    type: "api",
    label: language.t("provider.connect.method.apiKey")
  }]);
  const [auth] = createResource(() => props.provider, () => controller.fetchAuthMethods(props.provider, {
    fallback,
    isAlive: () => alive.value
  }));
  const loading = createMemo(() => auth.loading && !controller.cachedAuth(props.provider));
  const methods = createMemo(() => auth.latest ?? controller.cachedAuth(props.provider) ?? fallback());
  const [store, setStore] = createStore({
    methodIndex: undefined,
    authorization: undefined,
    state: "pending",
    error: undefined
  });
  function dispatch(action) {
    setStore(produce(draft => {
      if (action.type === "method.select") {
        draft.methodIndex = action.index;
        draft.authorization = undefined;
        draft.state = undefined;
        draft.error = undefined;
        return;
      }
      if (action.type === "method.reset") {
        draft.methodIndex = undefined;
        draft.authorization = undefined;
        draft.state = undefined;
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.prompt") {
        draft.state = "prompt";
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.pending") {
        draft.state = "pending";
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.complete") {
        draft.state = "complete";
        draft.authorization = action.authorization;
        draft.error = undefined;
        return;
      }
      draft.state = "error";
      draft.error = action.error;
    }));
  }
  const method = createMemo(() => store.methodIndex !== undefined ? methods().at(store.methodIndex) : undefined);
  const methodLabel = value => {
    if (!value) return "";
    if (value.type === "api") return language.t("provider.connect.method.apiKey");
    return value.label ?? "";
  };
  function formatError(value, fallback) {
    if (value && typeof value === "object" && "data" in value) {
      const data = value.data;
      if (typeof data?.message === "string" && data.message) return data.message;
    }
    if (value && typeof value === "object" && "error" in value) {
      const nested = formatError(value.error, "");
      if (nested) return nested;
    }
    if (value && typeof value === "object" && "message" in value) {
      const message = value.message;
      if (typeof message === "string" && message) return message;
    }
    if (value instanceof Error && value.message) return value.message;
    if (typeof value === "string" && value) return value;
    return fallback;
  }
  async function selectMethod(index, inputs) {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    const method = methods()[index];
    dispatch({
      type: "method.select",
      index
    });
    if (method.type === "oauth") {
      if (method.prompts?.length && !inputs) {
        dispatch({
          type: "auth.prompt"
        });
        return;
      }
      dispatch({
        type: "auth.pending"
      });
      const start = Date.now();
      await controller.authorizeOAuth(props.provider, index, inputs).then(data => {
        if (!alive.value) return;
        const elapsed = Date.now() - start;
        const delay = 1000 - elapsed;
        if (delay > 0) {
          if (timer.current !== undefined) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = undefined;
            if (!alive.value) return;
            dispatch({
              type: "auth.complete",
              authorization: data
            });
          }, delay);
          return;
        }
        dispatch({
          type: "auth.complete",
          authorization: data
        });
      }).catch(e => {
        if (!alive.value) return;
        dispatch({
          type: "auth.error",
          error: formatError(e, language.t("common.requestFailed"))
        });
      });
    }
  }
  function OAuthPromptsView() {
    const [formStore, setFormStore] = createStore({
      value: {},
      index: 0
    });
    const prompts = createMemo(() => {
      const value = method();
      if (value?.type !== "oauth") return [];
      return value.prompts ?? [];
    });
    const matches = (prompt, value) => {
      if (!prompt.when) return true;
      const actual = value[prompt.when.key];
      if (actual === undefined) return false;
      return prompt.when.op === "eq" ? actual === prompt.when.value : actual !== prompt.when.value;
    };
    const current = createMemo(() => {
      const all = prompts();
      const index = all.findIndex((prompt, index) => index >= formStore.index && matches(prompt, formStore.value));
      if (index === -1) return;
      return {
        index,
        prompt: all[index]
      };
    });
    const valid = createMemo(() => {
      const item = current();
      if (!item || item.prompt.type !== "text") return false;
      const value = formStore.value[item.prompt.key] ?? "";
      return value.trim().length > 0;
    });
    async function next(index, value) {
      if (store.methodIndex === undefined) return;
      const next = prompts().findIndex((prompt, i) => i > index && matches(prompt, value));
      if (next !== -1) {
        setFormStore("index", next);
        return;
      }
      await selectMethod(store.methodIndex, value);
    }
    async function handleSubmit(e) {
      e.preventDefault();
      const item = current();
      if (!item || item.prompt.type !== "text") return;
      if (!valid()) return;
      await next(item.index, formStore.value);
    }
    const item = () => current();
    // Kept for parity with the original component: it defined this memo but
    // never rendered a text-prompt UI (submission flows through handleSubmit).
    const text = createMemo(() => {
      const prompt = item()?.prompt;
      if (!prompt || prompt.type !== "text") return;
      return prompt;
    });
    const select = createMemo(() => {
      const prompt = item()?.prompt;
      if (!prompt || prompt.type !== "select") return;
      return prompt;
    });
    void text;

    const form = template(`<form class="d-flex flex-column align-items-start gap-4"></form>`);
    form.addEventListener("submit", handleSubmit);
    // The original Switch had a single Match: mount the select UI while the
    // current prompt is a select, otherwise render nothing. Key the rebuild on
    // the prompt object (stable identity, default memo equality) so the List
    // survives unrelated store updates but is rebuilt when navigation reaches
    // a different select prompt. createComponent untracks, so the vanilla List
    // reads its items once at creation — a boolean key would freeze the
    // options of the first select prompt across prompt-to-prompt transitions.
    createEffect(() => {
      const prompt = select();
      if (!prompt) {
        form.replaceChildren();
        return;
      }
      const box = template(`<div class="w-100 d-flex flex-column gap-1.5"><div class="text-body" data-slot="message"></div><div data-slot="options"></div></div>`);
      const message = box.querySelector('[data-slot="message"]');
      const options = box.querySelector('[data-slot="options"]');
      // The message belongs to this prompt, so it is static per rebuild.
      message.textContent = prompt.message ?? "";
      options.appendChild(createComponent(List, {
        items: prompt.options ?? [],
        key: x => x.value,
        get current() {
          return prompt.options?.find(x => x.value === formStore.value[prompt.key]);
        },
        onSelect: value => {
          if (!value) return;
          const nextValue = {
            ...formStore.value,
            [prompt.key]: value.value
          };
          setFormStore("value", prompt.key, value.value);
          void next(item().index, nextValue);
        },
        children: option => {
          const row = listRow(true);
          row.querySelector('[data-slot="label"]').textContent = option.label ?? "";
          row.querySelector('[data-slot="hint"]').textContent = option.hint ?? "";
          return row;
        }
      }));
      form.replaceChildren(box);
    });
    return form;
  }
  let listRef;
  function handleKey(e) {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      return;
    }
    if (e.key === "Escape") return;
    listRef?.onKeyDown(e);
  }
  let auto = false;
  createEffect(() => {
    if (auto) return;
    if (loading()) return;
    if (methods().length === 1) {
      auto = true;
      void selectMethod(0);
    }
  });
  function complete() {
    dialog.close();
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("provider.connect.toast.connected.title", {
        provider: provider().name
      }),
      description: language.t("provider.connect.toast.connected.description", {
        provider: provider().name
      })
    });
  }
  function goBack() {
    if (methods().length === 1) {
      all();
      return;
    }
    if (store.authorization) {
      dispatch({
        type: "method.reset"
      });
      return;
    }
    if (store.methodIndex !== undefined) {
      dispatch({
        type: "method.reset"
      });
      return;
    }
    all();
  }
  function MethodSelection() {
    const heading = template(`<div class="text-body"></div>`);
    createEffect(() => {
      heading.textContent = language.t("provider.connect.selectMethod", {
        provider: provider().name
      });
    });
    const listHost = document.createElement("div");
    // The vanilla List reads `items` once at creation (createComponent
    // untracks), so rebuild it when the method set changes — e.g. when cached
    // auth methods are replaced by the freshly fetched ones.
    createEffect(() => {
      const items = methods();
      // List renders asynchronously, so effects created inside `children`
      // would be ownerless (never disposed); re-attach them to this effect's
      // owner so they are cleaned up on rebuild/unmount.
      const owner = getOwner();
      listHost.replaceChildren(createComponent(List, {
        ref: ref => {
          listRef = ref;
        },
        items,
        key: m => m?.label,
        onSelect: async (selected, index) => {
          if (!selected) return;
          void selectMethod(index);
        },
        children: i => {
          const row = listRow(false);
          const label = row.querySelector('[data-slot="label"]');
          // methodLabel() goes through language.t for API-key methods, so keep
          // it live across locale switches.
          runWithOwner(owner, () => createEffect(() => {
            label.textContent = methodLabel(i);
          }));
          return row;
        }
      }));
    });
    return [heading, listHost];
  }
  function ApiAuthView() {
    const [formStore, setFormStore] = createStore({
      value: "",
      error: undefined
    });
    async function handleSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const apiKey = formData.get("apiKey");
      if (!apiKey?.trim()) {
        setFormStore("error", language.t("provider.connect.apiKey.required"));
        return;
      }
      setFormStore("error", undefined);
      await controller.connect(props.provider, apiKey);
      complete();
    }
    const root = template(`<div class="d-flex flex-column gap-6"><form class="d-flex flex-column align-items-start gap-4"></form></div>`);
    const form = root.firstElementChild;
    // The original wrapped this description in a Switch with a single
    // always-true Match, so it is effectively a static block before the form.
    const description = template(`<div class="text-body"></div>`);
    createEffect(() => {
      description.textContent = language.t("provider.connect.apiKey.description", {
        provider: provider().name
      });
    });
    root.insertBefore(description, form);
    form.addEventListener("submit", handleSubmit);
    const field = createComponent(TextField, {
      autofocus: true,
      type: "text",
      get label() {
        return language.t("provider.connect.apiKey.label", {
          provider: provider().name
        });
      },
      get placeholder() {
        return language.t("provider.connect.apiKey.placeholder");
      },
      name: "apiKey",
      get value() {
        return formStore.value;
      },
      onChange: v => setFormStore("value", v)
    });
    // The vanilla TextField reads `error`/`validationState` once at creation,
    // so mirror its invalid markup externally to keep the submit error live.
    const input = field.querySelector("input");
    const errorEl = document.createElement("div");
    errorEl.className = "text-danger small mt-1";
    createEffect(() => {
      const error = formStore.error;
      input.classList.toggle("is-invalid", !!error);
      if (!error) {
        errorEl.remove();
        return;
      }
      errorEl.textContent = error;
      if (!errorEl.parentNode) field.appendChild(errorEl);
    });
    form.appendChild(field);
    // The vanilla Button renders its children once — pass a text node kept
    // live by an effect so the label follows locale switches.
    const submitLabel = document.createTextNode("");
    createEffect(() => {
      submitLabel.data = language.t("common.continue");
    });
    form.appendChild(createComponent(Button, {
      "class": "w-auto",
      type: "submit",
      size: "large",
      variant: "primary",
      children: submitLabel
    }));
    return root;
  }
  function OAuthCodeView() {
    const [formStore, setFormStore] = createStore({
      value: "",
      error: undefined
    });
    async function handleSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const code = formData.get("code");
      if (!code?.trim()) {
        setFormStore("error", language.t("provider.connect.oauth.code.required"));
        return;
      }
      setFormStore("error", undefined);
      const result = await controller.completeOAuth(props.provider, store.methodIndex, code);
      if (result.ok) {
        complete();
        return;
      }
      setFormStore("error", formatError(result.error, language.t("provider.connect.oauth.code.invalid")));
    }
    const root = template(`<div class="d-flex flex-column gap-6"><div class="text-body" data-slot="visit"></div><form class="d-flex flex-column align-items-start gap-4"></form></div>`);
    const visit = root.firstElementChild;
    const form = visit.nextElementSibling;
    const prefix = document.createTextNode("");
    createEffect(() => {
      prefix.data = language.t("provider.connect.oauth.code.visit.prefix");
    });
    visit.appendChild(prefix);
    visit.appendChild(createComponent(Link, {
      get href() {
        return store.authorization.url;
      },
      get children() {
        return language.t("provider.connect.oauth.code.visit.link");
      }
    }));
    const suffix = document.createTextNode("");
    createEffect(() => {
      suffix.data = language.t("provider.connect.oauth.code.visit.suffix", {
        provider: provider().name
      });
    });
    visit.appendChild(suffix);
    form.addEventListener("submit", handleSubmit);
    const field = createComponent(TextField, {
      autofocus: true,
      type: "text",
      get label() {
        return language.t("provider.connect.oauth.code.label", {
          method: method()?.label ?? ""
        });
      },
      get placeholder() {
        return language.t("provider.connect.oauth.code.placeholder");
      },
      name: "code",
      get value() {
        return formStore.value;
      },
      onChange: v => setFormStore("value", v)
    });
    // The vanilla TextField reads `error`/`validationState` once at creation,
    // so mirror its invalid markup externally to keep the submit error live.
    const input = field.querySelector("input");
    const errorEl = document.createElement("div");
    errorEl.className = "text-danger small mt-1";
    createEffect(() => {
      const error = formStore.error;
      input.classList.toggle("is-invalid", !!error);
      if (!error) {
        errorEl.remove();
        return;
      }
      errorEl.textContent = error;
      if (!errorEl.parentNode) field.appendChild(errorEl);
    });
    form.appendChild(field);
    // The vanilla Button renders its children once — pass a text node kept
    // live by an effect so the label follows locale switches.
    const submitLabel = document.createTextNode("");
    createEffect(() => {
      submitLabel.data = language.t("common.continue");
    });
    form.appendChild(createComponent(Button, {
      "class": "w-auto",
      type: "submit",
      size: "large",
      variant: "primary",
      children: submitLabel
    }));
    return root;
  }
  function OAuthAutoView() {
    const code = createMemo(() => {
      const instructions = store.authorization?.instructions;
      if (instructions?.includes(":")) {
        return instructions.split(":")[1]?.trim();
      }
      return instructions;
    });
    onMount(() => {
      void (async () => {
        const result = await controller.completeOAuth(props.provider, store.methodIndex);
        if (!alive.value) return;
        if (!result.ok) {
          const message = formatError(result.error, language.t("common.requestFailed"));
          dispatch({
            type: "auth.error",
            error: message
          });
          return;
        }
        complete();
      })();
    });
    const root = template(`<div class="d-flex flex-column gap-6"><div class="text-body" data-slot="visit"></div><div class="text-body d-flex align-items-center gap-4" data-slot="status"><span data-slot="waiting"></span></div></div>`);
    const visit = root.firstElementChild;
    const status = visit.nextElementSibling;
    const waiting = status.querySelector('[data-slot="waiting"]');
    const prefix = document.createTextNode("");
    createEffect(() => {
      prefix.data = language.t("provider.connect.oauth.auto.visit.prefix");
    });
    visit.appendChild(prefix);
    visit.appendChild(createComponent(Link, {
      get href() {
        return store.authorization.url;
      },
      get children() {
        return language.t("provider.connect.oauth.auto.visit.link");
      }
    }));
    const suffix = document.createTextNode("");
    createEffect(() => {
      suffix.data = language.t("provider.connect.oauth.auto.visit.suffix", {
        provider: provider().name
      });
    });
    visit.appendChild(suffix);
    root.insertBefore(createComponent(TextField, {
      get label() {
        return language.t("provider.connect.oauth.auto.confirmationCode");
      },
      "class": "font-mono",
      get value() {
        return code();
      },
      readOnly: true,
      copyable: true
    }), status);
    status.insertBefore(createComponent(Spinner, {}), waiting);
    createEffect(() => {
      waiting.textContent = language.t("provider.connect.status.waiting");
    });
    return root;
  }
  // Spinner + "in progress" line (used by both the loading and pending states).
  function buildProgress() {
    const root = template(`<div class="text-body"><div class="d-flex align-items-center gap-x-2"><span data-slot="text"></span></div></div>`);
    const inner = root.firstElementChild;
    const text = inner.querySelector('[data-slot="text"]');
    inner.insertBefore(createComponent(Spinner, {}), text);
    createEffect(() => {
      text.textContent = language.t("provider.connect.status.inProgress");
    });
    return root;
  }
  function buildError() {
    const root = template(`<div class="text-body"><div class="d-flex align-items-center gap-x-2"><span data-slot="text"></span></div></div>`);
    const inner = root.firstElementChild;
    const text = inner.querySelector('[data-slot="text"]');
    inner.insertBefore(createComponent(Icon, {
      name: "circle-ban-sign",
      "class": "text-danger"
    }), text);
    createEffect(() => {
      text.textContent = language.t("provider.connect.status.failed", {
        error: store.error ?? ""
      });
    });
    return root;
  }
  const dialogEl = createComponent(Dialog, {
    // bs/Dialog renders `title` with textContent, so a Node passed here would
    // be coerced to "[object HTMLButtonElement]". Pass a placeholder string to
    // force the header, then swap the title slot for the back IconButton below.
    title: " ",
    get children() {
      const root = template(`<div class="d-flex flex-column gap-6 px-2.5 pb-3"><div class="px-2.5 d-flex gap-4 align-items-center"><div class="fs-6 fw-medium text-body-emphasis" data-slot="title"></div></div><div class="px-2.5 pb-10 d-flex flex-column gap-6"><div tabindex="0" data-slot="body"></div></div></div>`);
      const header = root.firstElementChild;
      const titleEl = header.querySelector('[data-slot="title"]');
      const body = root.querySelector('[data-slot="body"]');
      header.insertBefore(createComponent(ProviderIcon, {
        get id() {
          return props.provider;
        },
        "class": "size-5 shrink-0 text-secondary"
      }), titleEl);
      createEffect(() => {
        titleEl.textContent = language.t("provider.connect.title", {
          provider: provider().name
        });
      });
      body.addEventListener("keydown", handleKey);
      // Switch/Match replacement: pick the first matching branch (original
      // Match order) and rebuild the body only when the branch key changes,
      // so per-view state (forms, List selection) survives unrelated updates
      // and views remount exactly when the original branches swapped.
      const branch = createMemo(() => {
        if (loading()) return "loading";
        if (store.methodIndex === undefined) return "select";
        if (store.state === "pending") return "pending";
        if (store.state === "prompt") return "prompt";
        if (store.state === "error") return "error";
        if (method()?.type === "api") return "api";
        if (method()?.type === "oauth") {
          if (store.authorization?.method === "code") return "oauth-code";
          if (store.authorization?.method === "auto") return "oauth-auto";
          return "none";
        }
        return "none";
      });
      createEffect(() => {
        switch (branch()) {
          case "loading":
          case "pending":
            body.replaceChildren(buildProgress());
            break;
          case "select":
            body.replaceChildren(...createComponent(MethodSelection, {}));
            break;
          case "prompt":
            body.replaceChildren(createComponent(OAuthPromptsView, {}));
            break;
          case "error":
            body.replaceChildren(buildError());
            break;
          case "api":
            body.replaceChildren(createComponent(ApiAuthView, {}));
            break;
          case "oauth-code":
            body.replaceChildren(createComponent(OAuthCodeView, {}));
            break;
          case "oauth-auto":
            body.replaceChildren(createComponent(OAuthAutoView, {}));
            break;
          default:
            body.replaceChildren();
        }
      });
      // The compiled output bound this with a render effect; keep that timing
      // so the attribute is in place before the dialog is shown.
      createRenderEffect(() => {
        body.autofocus = store.methodIndex === undefined ? true : undefined;
      });
      return root;
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
