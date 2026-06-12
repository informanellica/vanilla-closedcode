import { createRenderEffect } from "solid-js";
import { useLanguage } from "@/context/language.js";

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export const ModelTooltip = props => {
  const language = useLanguage();
  const sourceName = model => {
    const value = `${model.id} ${model.name}`.toLowerCase();
    if (/llama|meta/.test(value)) return language.t("model.provider.meta");
    if (/qwen/.test(value)) return "Qwen";
    return model.provider.name;
  };
  const inputLabel = value => {
    if (value === "text") return language.t("model.input.text");
    if (value === "image") return language.t("model.input.image");
    if (value === "audio") return language.t("model.input.audio");
    if (value === "video") return language.t("model.input.video");
    if (value === "pdf") return language.t("model.input.pdf");
    return value;
  };
  const title = () => {
    const tags = [];
    if (props.latest) tags.push(language.t("model.tag.latest"));
    if (props.free) tags.push(language.t("model.tag.free"));
    const suffix = tags.length ? ` (${tags.join(", ")})` : "";
    return `${sourceName(props.model)} ${props.model.name}${suffix}`;
  };
  const inputs = () => {
    if (props.model.capabilities) {
      const input = props.model.capabilities.input;
      const order = ["text", "image", "audio", "video", "pdf"];
      const entries = order.filter(key => input[key]).map(key => inputLabel(key));
      return entries.length ? entries.join(", ") : undefined;
    }
    const raw = props.model.modalities?.input;
    if (!raw) return;
    const entries = raw.map(value => inputLabel(value));
    return entries.length ? entries.join(", ") : undefined;
  };
  const reasoning = () => {
    if (props.model.capabilities) return props.model.capabilities.reasoning ? language.t("model.tooltip.reasoning.allowed") : language.t("model.tooltip.reasoning.none");
    return props.model.reasoning ? language.t("model.tooltip.reasoning.allowed") : language.t("model.tooltip.reasoning.none");
  };
  const context = () => language.t("model.tooltip.context", {
    limit: props.model.limit.context.toLocaleString()
  });

  const root = template(`
    <div class="flex flex-col gap-1 py-1">
      <div class="fw-medium" data-slot="title"></div>
      <div class="small fw-normal text-white" data-slot="reasoning"></div>
      <div class="small fw-normal text-white" data-slot="context"></div>
    </div>`);
  const titleEl = root.querySelector('[data-slot="title"]');
  const reasoningEl = root.querySelector('[data-slot="reasoning"]');
  const contextEl = root.querySelector('[data-slot="context"]');

  // Show equivalent: the inputs line sits between the title and the reasoning
  // line only when the model lists at least one input modality.
  const inputsEl = document.createElement("div");
  inputsEl.className = "small fw-normal text-white";

  createRenderEffect(() => {
    titleEl.textContent = title();
  });
  createRenderEffect(() => {
    const value = inputs();
    if (value) {
      inputsEl.textContent = language.t("model.tooltip.allows", {
        inputs: value
      });
      if (inputsEl.parentNode !== root) root.insertBefore(inputsEl, reasoningEl);
    } else {
      inputsEl.remove();
    }
  });
  createRenderEffect(() => {
    reasoningEl.textContent = reasoning();
  });
  createRenderEffect(() => {
    contextEl.textContent = context();
  });
  return root;
};
