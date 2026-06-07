import { createMemo, createResource } from "solid-js";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "@/context/global-sync.js";

/**
 * Settings controller (MVC).
 *
 * Orchestrates the Model (@/context/global-sync.js, @/context/global-sdk.js)
 * and the SDK for the general settings View. Owns the `pty.shells` resource
 * loading and shell-persistence side effects so the View only renders form
 * controls.
 *
 * Must be invoked inside a component / hook reactive setup scope (it calls
 * context hooks and reactive primitives).
 *
 * Returns derived state accessors and action functions.
 */
export const useSettingsController = () => {
  const globalSync = useGlobalSync();
  const globalSdk = useGlobalSDK();

  // SDK-backed resource: available pty shells. Loads once and never throws into
  // the View (failures resolve to an empty list).
  const [shells] = createResource(
    () => globalSdk.client.pty.shells().then(res => res.data ?? []).catch(() => []),
    { initialValue: [] },
  );

  // Derived Model state: the currently persisted shell ("" === auto/default).
  const currentShell = createMemo(() => globalSync.data.config.shell ?? "");

  // Action: persist a new shell selection. No-op when unchanged.
  const setShell = value => {
    if (value === currentShell()) return;
    globalSync.updateConfig({ shell: value });
  };

  return {
    // Derived state accessors
    shells,
    currentShell,
    // Actions
    setShell,
  };
};
