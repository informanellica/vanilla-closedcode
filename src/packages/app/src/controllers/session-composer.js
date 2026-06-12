import { createMemo, createResource } from "solid-js";
import { useParams } from "@/lib/router/index.js";
import { useQueries } from "@tanstack/solid-query";
import { showToast } from "@/lib/toast.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { usePermission } from "@/context/permission.js";
import { useSDK } from "@/context/sdk.js";
import { useSync } from "@/context/sync.js";
import { usePrompt } from "@/context/prompt.js";
import { loadAgentsQuery, loadProvidersQuery } from "@/context/global-sync/bootstrap.js";
import { createPromptSubmit } from "@/components/prompt-input/submit.js";

/**
 * Session composer controller (MVC).
 *
 * Orchestrates the Model (@/context/sdk.js, @/context/sync.js,
 * @/context/global-sync.js, @/context/prompt.js, @/context/permission.js) and
 * the SDK for the session-composer feature. Owns the prompt-submission and
 * question / permission-reply pipeline so the composer Views hold only
 * input/render state.
 *
 * Logic owned here:
 *   - prompt submit + abort (session.command / promptAsync / abort,
 *     sdk.createClient provider/model override, globalSync child-store
 *     optimistic writes) via createPromptSubmit.
 *   - auto-accept reads and the agents/providers query priming tied to the
 *     composer.
 *   - permission.respond + autoResponds gating (respondPermission).
 *   - question.reply / question.reject mutations (replyQuestion /
 *     rejectQuestion).
 *
 * Must be invoked inside a component / hook reactive setup scope (it calls
 * context hooks and reactive primitives). It depends on Model (@/context/*)
 * and the SDK only; it imports no View components, no @/bs/*, and no
 * @/vendor/ui markup.
 *
 * Returns derived state accessors and action functions.
 */
export const useComposerController = (input = {}) => {
  const params = useParams();
  const sdk = useSDK();
  const sync = useSync();
  const language = useLanguage();
  const permission = usePermission();
  const prompt = usePrompt();
  useGlobalSync();

  // Derived Model state: whether new/active session auto-accepts permissions.
  const accepting = createMemo(() => {
    const id = params.id;
    if (!id) return permission.isAutoAcceptingDirectory(sdk.directory);
    return permission.isAutoAccepting(id, sdk.directory);
  });

  // Agents / providers query priming tied to the composer's project directory.
  const [agentsQuery, globalProvidersQuery, providersQuery] = useQueries(() => ({
    queries: [loadAgentsQuery(sdk.directory), loadProvidersQuery(null), loadProvidersQuery(sdk.directory)],
  }));
  const agentsLoading = () => agentsQuery.isLoading;
  const agentsShouldFadeIn = createMemo(prev => prev ?? agentsLoading());
  const providersLoading = () =>
    agentsLoading() || providersQuery.isLoading || globalProvidersQuery.isLoading;
  const providersShouldFadeIn = createMemo(prev => prev ?? providersLoading());

  // Prompt-ready gate (resolves once the prompt context is hydrated).
  const [promptReady] = createResource(
    () => prompt.ready().promise,
    p => p,
  );

  // Prompt submission + abort pipeline. The View supplies its input/render
  // accessors; all SDK orchestration and optimistic writes live in
  // createPromptSubmit, which this controller owns.
  const submitInput = {
    autoAccept: () => accepting(),
    ...input,
  };
  const { abort, handleSubmit } = createPromptSubmit(submitInput);

  // Action: respond to a permission request. Caller supplies the active
  // permission and a guard/marker so the optimistic responding-state gating is
  // preserved exactly.
  const respondPermission = ({ permission: perm, response, isResponding, mark, clear }) => {
    if (!perm) return;
    if (isResponding?.()) return;
    mark?.(perm.id);
    sdk.client.permission
      .respond({
        sessionID: perm.sessionID,
        permissionID: perm.id,
        response,
      })
      .catch(err => {
        const description = err instanceof Error ? err.message : String(err);
        showToast({
          title: language.t("common.requestFailed"),
          description,
        });
      })
      .finally(() => {
        clear?.(perm.id);
      });
  };

  // Whether a permission request item must be answered (not auto-handled).
  const requiresPermission = item => !permission.autoResponds(item, sdk.directory);

  // Action: reply to a question request.
  const replyQuestion = ({ requestID, answers }) =>
    sdk.client.question.reply({ requestID, answers });

  // Action: reject a question request.
  const rejectQuestion = ({ requestID }) =>
    sdk.client.question.reject({ requestID });

  return {
    // Derived state accessors
    accepting,
    agentsLoading,
    agentsShouldFadeIn,
    providersLoading,
    providersShouldFadeIn,
    promptReady,
    requiresPermission,
    // Actions
    submit: handleSubmit,
    abort,
    respondPermission,
    replyQuestion,
    rejectQuestion,
  };
};
