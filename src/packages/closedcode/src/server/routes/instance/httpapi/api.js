/**
 * @file Assembles the Effect HttpApi definitions for ClosedCode: composes the root,
 * event, instance, and PTY-connect API groups into the top-level ClosedCodeHttpApi.
 */
import { Schema } from "effect";
import { HttpApi } from "effect/unstable/httpapi";
import { BusEvent } from "#bus/bus-event.js";
import { SyncEvent } from "#sync/index.js";
import { ConfigApi } from "./groups/config.js";
import { ControlApi } from "./groups/control.js";
import { EventApi } from "./event.js";
import { ExperimentalApi } from "./groups/experimental.js";
import { FileApi } from "./groups/file.js";
import { GlobalApi } from "./groups/global.js";
import { InstanceApi } from "./groups/instance.js";
import { McpApi } from "./groups/mcp.js";
import { PermissionApi } from "./groups/permission.js";
import { ProjectApi } from "./groups/project.js";
import { ProviderApi } from "./groups/provider.js";
import { PtyApi, PtyConnectApi } from "./groups/pty.js";
import { QuestionApi } from "./groups/question.js";
import { SessionApi } from "./groups/session.js";
import { SyncApi } from "./groups/sync.js";
import { TuiApi } from "./groups/tui.js";
import { WorkspaceApi } from "./groups/workspace.js";
import { V2Api } from "./groups/v2.js";

// SSE event schemas built from the same BusEvent/SyncEvent registries that
// the Express spec uses, so both specs emit identical Event/SyncEvent components.
const EventSchema = Schema.Union(BusEvent.effectPayloads()).annotate({
  identifier: "Event"
});
const SyncEventSchemas = SyncEvent.effectPayloads();
/** Root (control-plane) HttpApi: control + global route groups. */
export const RootHttpApi = HttpApi.make("closedcode-root").addHttpApi(ControlApi).addHttpApi(GlobalApi);
/** Instance HttpApi: all per-instance route groups (config, file, session, sync, etc.). */
export const InstanceHttpApi = HttpApi.make("closedcode-instance").addHttpApi(ConfigApi).addHttpApi(ExperimentalApi).addHttpApi(FileApi).addHttpApi(InstanceApi).addHttpApi(McpApi).addHttpApi(ProjectApi).addHttpApi(PtyApi).addHttpApi(QuestionApi).addHttpApi(PermissionApi).addHttpApi(ProviderApi).addHttpApi(SessionApi).addHttpApi(SyncApi).addHttpApi(V2Api).addHttpApi(TuiApi).addHttpApi(WorkspaceApi);
/** Top-level HttpApi combining root, event stream, instance, and PTY-connect APIs, with shared Event/SyncEvent schemas annotated. */
export const ClosedCodeHttpApi = HttpApi.make("closedcode").addHttpApi(RootHttpApi).addHttpApi(EventApi).addHttpApi(InstanceHttpApi).addHttpApi(PtyConnectApi).annotate(HttpApi.AdditionalSchemas, [EventSchema, ...SyncEventSchemas]);