import { useGlobalSync } from "@/context/global-sync.js";
import { decode64 } from "@/utils/base64.js";
import { useParams } from "@/lib/router/index.js";
import { createMemo } from "solid-js";
export const popularProviders = ["lmstudio", "ollama"];
const popularProviderSet = new Set(popularProviders);
export function useProviders() {
  const globalSync = useGlobalSync();
  const params = useParams();
  const dir = createMemo(() => decode64(params.dir) ?? "");
  const providers = () => {
    if (dir()) {
      const [projectStore] = globalSync.child(dir());
      if (projectStore.provider_ready) return projectStore.provider;
    }
    return globalSync.data.provider;
  };
  return {
    all: () => providers().all,
    default: () => providers().default,
    popular: () => providers().all.filter(p => popularProviderSet.has(p.id)),
    connected: () => {
      const connected = new Set(providers().connected);
      return providers().all.filter(p => connected.has(p.id));
    },
    paid: () => {
      const connected = new Set(providers().connected);
      return providers().all.filter(p => connected.has(p.id) && (p.id !== "opencode" || Object.values(p.models).some(m => m.cost?.input)));
    }
  };
}