import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="flex flex-col gap-1 py-1"><div class="fw-medium"></div><div class="small fw-normal text-white"></div><div class="small fw-normal text-white">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="small fw-normal text-white">`);
import { Show } from "solid-js";
import { useLanguage } from "@/context/language.js";
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
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.nextSibling;
    _$insert(_el$2, title);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return inputs();
      },
      children: value => (() => {
        var _el$5 = _tmpl$2();
        _$insert(_el$5, () => language.t("model.tooltip.allows", {
          inputs: value()
        }));
        return _el$5;
      })()
    }), _el$3);
    _$insert(_el$3, reasoning);
    _$insert(_el$4, context);
    return _el$;
  })();
};