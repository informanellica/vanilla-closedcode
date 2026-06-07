import { headerRow, modelRow } from "./dialog-custom-provider-form.js";
export const localPresets = [{
  id: "_preset_ollama",
  providerID: "ollama",
  name: "Ollama",
  baseURL: "http://localhost:11434/v1",
  models: [{
    id: "llama3.2",
    name: "Llama 3.2"
  }, {
    id: "qwen2.5-coder",
    name: "Qwen2.5 Coder"
  }],
  description: "Local models via Ollama (default port 11434)",
  docs: "https://ollama.com"
}, {
  id: "_preset_lmstudio",
  providerID: "lmstudio",
  name: "LM Studio",
  baseURL: "http://localhost:1234/v1",
  models: [{
    id: "local-model",
    name: "Local Model"
  }],
  description: "Local models via LM Studio (default port 1234)",
  docs: "https://lmstudio.ai"
}, {
  id: "_preset_llamacpp",
  providerID: "llamacpp",
  name: "llama.cpp",
  baseURL: "http://localhost:8080/v1",
  models: [{
    id: "local-model",
    name: "Local Model"
  }],
  description: "Local models via llama.cpp server (default port 8080)",
  docs: "https://github.com/ggerganov/llama.cpp"
}, {
  id: "_preset_vllm",
  providerID: "vllm",
  name: "vLLM",
  baseURL: "http://localhost:8000/v1",
  models: [{
    id: "local-model",
    name: "Local Model"
  }],
  description: "Local models via vLLM (default port 8000)",
  docs: "https://docs.vllm.ai"
}, {
  id: "_preset_jan",
  providerID: "jan",
  name: "Jan",
  baseURL: "http://localhost:1337/v1",
  models: [{
    id: "local-model",
    name: "Local Model"
  }],
  description: "Local models via Jan (default port 1337)",
  docs: "https://jan.ai"
}];
export const localPresetMap = new Map(localPresets.map(p => [p.id, p]));
export function presetToFormState(preset) {
  return {
    providerID: preset.providerID,
    name: preset.name,
    baseURL: preset.baseURL,
    apiKey: "",
    models: preset.models.map(m => ({
      ...modelRow(),
      id: m.id,
      name: m.name
    })),
    headers: [headerRow()],
    err: {}
  };
}